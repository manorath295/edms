/**
 * @file hashedtokens.c
 * @brief Implementation of HashedTokens C Client Wrapper for EDMS
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <curl/curl.h>

#ifdef _WIN32
#include <windows.h>
#else
#include <unistd.h>
#endif

#include "hashedtokens.h"
#include "cJSON.h"

// Memory buffer for libcurl write callbacks
typedef struct {
    char *memory;
    size_t size;
} memory_buffer_t;

static size_t write_memory_callback(void *contents, size_t size, size_t nmemb, void *userp)
{
    size_t realsize = size * nmemb;
    memory_buffer_t *mem = (memory_buffer_t *)userp;

    char *ptr = (char *)realloc(mem->memory, mem->size + realsize + 1);
    if (!ptr) {
        return 0; // Out of memory
    }

    mem->memory = ptr;
    memcpy(&(mem->memory[mem->size]), contents, realsize);
    mem->size += realsize;
    mem->memory[mem->size] = 0;

    return realsize;
}

ht_options_t ht_default_options(void)
{
    ht_options_t opt;
    opt.timeout_sec = 15;
    opt.collection = "default";
    opt.headers_json = NULL;
    const char *env_host = getenv("EDMS_HOST");
    opt.edms_host = (env_host && strlen(env_host) > 0) ? env_host : "localhost:3000";
    opt.use_https = false;
    opt.api_type = "collections";
    opt.use_websocket = true;
    return opt;
}

static bool parse_edms_result_json(const char *json_str, ht_edms_response_t *edms)
{
    if (!json_str || !edms) return false;

    cJSON *root = cJSON_Parse(json_str);
    if (!root) return false;

    // Check if initial 202 accepted response: {"ok": true, "transaction_id": ...}
    cJSON *ok_item = cJSON_GetObjectItem(root, "ok");
    if (ok_item && cJSON_IsTrue(ok_item)) {
        if (edms->code == HT_STATUS_UNKNOWN) {
            edms->code = HT_STATUS_OK;
            strncpy(edms->name, "OK", sizeof(edms->name) - 1);
            strncpy(edms->message, "Accepted and recorded by EDMS Dev API", sizeof(edms->message) - 1);
        }
    }

    cJSON *target = root;
    cJSON *evt = cJSON_GetObjectItem(target, "event");
    if (evt && cJSON_IsObject(evt)) {
        target = evt;
    }
    cJSON *payload = cJSON_GetObjectItem(target, "payload");
    if (payload && cJSON_IsObject(payload)) {
        target = payload;
    }
    cJSON *res_obj = cJSON_GetObjectItem(target, "result");
    if (res_obj && cJSON_IsObject(res_obj)) {
        target = res_obj;
    }

    // 1. Status object or code
    bool found_status = false;
    cJSON *status_obj = cJSON_GetObjectItem(target, "status");
    if (status_obj && cJSON_IsObject(status_obj)) {
        found_status = true;
        cJSON *code_item = cJSON_GetObjectItem(status_obj, "code");
        if (code_item && cJSON_IsNumber(code_item)) {
            edms->code = code_item->valueint;
        }
        cJSON *name_item = cJSON_GetObjectItem(status_obj, "name");
        if (name_item && cJSON_IsString(name_item) && name_item->valuestring) {
            strncpy(edms->name, name_item->valuestring, sizeof(edms->name) - 1);
        }
        cJSON *msg_item = cJSON_GetObjectItem(status_obj, "message");
        if (msg_item && cJSON_IsString(msg_item) && msg_item->valuestring) {
            strncpy(edms->message, msg_item->valuestring, sizeof(edms->message) - 1);
        }
    } else if (status_obj && cJSON_IsNumber(status_obj)) {
        found_status = true;
        edms->code = status_obj->valueint;
    }

    // 2. Endpoint ID
    cJSON *eid = cJSON_GetObjectItem(target, "endpoint_id");
    if (eid && cJSON_IsString(eid) && eid->valuestring) {
        strncpy(edms->endpoint_id, eid->valuestring, sizeof(edms->endpoint_id) - 1);
    }

    // 3. Request Number
    cJSON *req_num = cJSON_GetObjectItem(target, "request_number");
    if (req_num && cJSON_IsNumber(req_num)) {
        edms->request_number = req_num->valueint;
    }

    // 4. Duplicate Of
    cJSON *dup_of = cJSON_GetObjectItem(target, "duplicate_of");
    if (dup_of && cJSON_IsNumber(dup_of)) {
        edms->duplicate_of = dup_of->valueint;
    }

    // 5. Creation flags
    cJSON *ep_created = cJSON_GetObjectItem(target, "endpoint_created");
    if (ep_created && cJSON_IsBool(ep_created)) {
        edms->endpoint_created = cJSON_IsTrue(ep_created);
    }
    cJSON *col_created = cJSON_GetObjectItem(target, "collection_created");
    if (col_created && cJSON_IsBool(col_created)) {
        edms->collection_created = cJSON_IsTrue(col_created);
    }

    // 6. Detail
    cJSON *detail = cJSON_GetObjectItem(target, "detail");
    if (detail && cJSON_IsString(detail) && detail->valuestring) {
        strncpy(edms->detail, detail->valuestring, sizeof(edms->detail) - 1);
    }

    cJSON_Delete(root);
    return found_status;
}

static bool fetch_edms_job_result(
    const char *host,
    const char *transaction_id,
    int timeout_sec,
    ht_edms_response_t *edms_out
) {
    if (!host || !transaction_id || transaction_id[0] == '\0' || !edms_out) return false;

    char job_url[512];
    snprintf(job_url, sizeof(job_url), "http://%s/jobs/%s", host, transaction_id);

    int max_retries = (timeout_sec > 0 ? timeout_sec : 15) * 10; // 100ms intervals
    for (int retry = 0; retry < max_retries; retry++) {
        CURL *curl = curl_easy_init();
        if (!curl) return false;

        memory_buffer_t resp_buf = { NULL, 0 };
        curl_easy_setopt(curl, CURLOPT_URL, job_url);
        curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_memory_callback);
        curl_easy_setopt(curl, CURLOPT_WRITEDATA, (void *)&resp_buf);
        curl_easy_setopt(curl, CURLOPT_TIMEOUT, 2L);

        CURLcode res = curl_easy_perform(curl);
        long http_status = 0;
        curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &http_status);
        curl_easy_cleanup(curl);

        if (res == CURLE_OK && http_status == 200 && resp_buf.memory) {
            cJSON *jr = cJSON_Parse(resp_buf.memory);
            if (jr) {
                cJSON *status_item = cJSON_GetObjectItem(jr, "status");
                if (status_item && cJSON_IsString(status_item) && status_item->valuestring) {
                    if (strcmp(status_item->valuestring, "done") == 0 || strcmp(status_item->valuestring, "failed") == 0) {
                        cJSON *res_obj = cJSON_GetObjectItem(jr, "result");
                        if (res_obj) {
                            char *res_str = cJSON_PrintUnformatted(res_obj);
                            if (res_str) {
                                parse_edms_result_json(res_str, edms_out);
                                free(res_str);
                                cJSON_Delete(jr);
                                free(resp_buf.memory);
                                return true;
                            }
                        }
                    }
                }
                cJSON_Delete(jr);
            }
        }
        if (resp_buf.memory) free(resp_buf.memory);

        #ifdef _WIN32
        Sleep(100);
        #else
        usleep(100000);
        #endif
    }
    return false;
}

static bool listen_edms_websocket(
    const char *host,
    int timeout_sec,
    ht_edms_response_t *edms_out
) {
    if (!host || !edms_out) return false;

    CURL *curl = curl_easy_init();
    if (!curl) return false;

    char ws_url[512];
    snprintf(ws_url, sizeof(ws_url), "ws://%s/hashedtokens/edms/api/ws", host);

    curl_easy_setopt(curl, CURLOPT_URL, ws_url);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, (long)(timeout_sec > 0 ? timeout_sec : 15));
    curl_easy_setopt(curl, CURLOPT_CONNECT_ONLY, 2L); // Unsecured WS connection per RWR spec

    CURLcode res = curl_easy_perform(curl);
    if (res != CURLE_OK) {
        curl_easy_cleanup(curl);
        return false;
    }

#if defined(CURLWS_TEXT)
    char buffer[8192];
    size_t rlen = 0;
    const struct curl_ws_frame *meta = NULL;

    int max_attempts = (timeout_sec > 0 ? timeout_sec : 15) * 20; // 50ms intervals
    for (int i = 0; i < max_attempts; i++) {
        rlen = 0;
        meta = NULL;
        CURLcode ws_res = curl_ws_recv(curl, buffer, sizeof(buffer) - 1, &rlen, &meta);
        if (ws_res == CURLE_OK && rlen > 0) {
            buffer[rlen] = '\0';
            if (parse_edms_result_json(buffer, edms_out)) {
                curl_easy_cleanup(curl);
                return true;
            }
        } else if (ws_res == CURLE_AGAIN) {
            #ifdef _WIN32
            Sleep(50);
            #else
            usleep(50000);
            #endif
        } else {
            break;
        }
    }
#endif

    curl_easy_cleanup(curl);
    return false;
}

static cJSON *parse_raw_headers_to_json(const char *raw)
{
    cJSON *obj = cJSON_CreateObject();
    if (!raw || strlen(raw) == 0) return obj;

    const char *line = raw;
    while (*line) {
        const char *next_line = strstr(line, "\r\n");
        size_t len = next_line ? (size_t)(next_line - line) : strlen(line);

        // Find ':' delimiter
        const char *colon = memchr(line, ':', len);
        if (colon && colon > line) {
            size_t key_len = colon - line;
            char key[128];
            if (key_len < sizeof(key)) {
                memcpy(key, line, key_len);
                key[key_len] = '\0';

                // Skip colon and leading spaces
                const char *val = colon + 1;
                while (*val == ' ' && (size_t)(val - line) < len) val++;
                size_t val_len = (line + len) - val;
                char value[512];
                if (val_len < sizeof(value)) {
                    memcpy(value, val, val_len);
                    value[val_len] = '\0';
                    cJSON_AddStringToObject(obj, key, value);
                }
            }
        }
        if (!next_line) break;
        line = next_line + 2;
    }
    return obj;
}

/**
 * @brief Submits the recorded request & response EQP pair to EDMS.
 */
static bool send_to_edms(
    const char *url,
    const char *crud,
    const char *request_payload,
    const char *response_body,
    const char *response_headers,
    ht_options_t options,
    ht_edms_response_t *edms_out,
    char *err_buf,
    size_t err_buf_len
) {
    CURL *curl = curl_easy_init();
    if (!curl) {
        snprintf(err_buf, err_buf_len, "Failed to initialize libcurl for EDMS request");
        return false;
    }

    // 1. Build EDMS JSON envelope matching dev_api.rs specification
    cJSON *root = cJSON_CreateObject();
    
    cJSON_AddStringToObject(root, "ops", "insert");
    cJSON_AddStringToObject(root, "endpoint_str", url);
    cJSON_AddStringToObject(root, "method", crud ? crud : "GET");
    cJSON_AddStringToObject(root, "collection", options.collection ? options.collection : "default");

    if (request_payload && strlen(request_payload) > 0) {
        cJSON *req_json = cJSON_Parse(request_payload);
        if (req_json) {
            cJSON_AddItemToObject(root, "request_body", req_json);
        } else {
            cJSON_AddStringToObject(root, "request_body", request_payload);
        }
    } else {
        cJSON_AddItemToObject(root, "request_body", cJSON_CreateObject());
    }

    if (response_body && strlen(response_body) > 0) {
        cJSON *resp_json = cJSON_Parse(response_body);
        if (resp_json) {
            cJSON_AddItemToObject(root, "response_body", resp_json);
        } else {
            cJSON_AddStringToObject(root, "response_body", response_body);
        }
    } else {
        cJSON_AddItemToObject(root, "response_body", cJSON_CreateObject());
    }

    // request_headers: user-provided headers sent with the original request
    // Backend expects separate "request_headers" and "response_headers" keys
    // (see collections_ops.rs headers_text() which combines them into the stored file)
    cJSON *req_hdr_obj = NULL;
    if (options.headers_json && strlen(options.headers_json) > 0) {
        req_hdr_obj = cJSON_Parse(options.headers_json);
    }
    if (!req_hdr_obj || !cJSON_IsObject(req_hdr_obj)) {
        if (req_hdr_obj) cJSON_Delete(req_hdr_obj);
        req_hdr_obj = cJSON_CreateObject();
        cJSON_AddStringToObject(req_hdr_obj, "User-Agent", "HashedTokens-C-SDK/1.0");
    }
    cJSON_AddItemToObject(root, "request_headers", req_hdr_obj);

    // response_headers: parse HTTP response headers into key-value JSON
    // This allows EDMS's sanitize_header_value to strip volatile headers (Date, CF-RAY, etc.)
    // so duplicate detection works reliably across runs.
    cJSON *resp_hdr_obj = parse_raw_headers_to_json(response_headers);
    cJSON_AddItemToObject(root, "response_headers", resp_hdr_obj);

    char *json_body = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);

    if (!json_body) {
        curl_easy_cleanup(curl);
        snprintf(err_buf, err_buf_len, "Failed to serialize EDMS JSON payload");
        return false;
    }

    // 2. Prepare HTTP POST to EDMS Webserver
    char edms_url[512];
    snprintf(
        edms_url,
        sizeof(edms_url),
        "%s://%s/hashedtokens/edms/api/%s/",
        options.use_https ? "https" : "http",
        options.edms_host ? options.edms_host : "localhost:3000",
        options.api_type ? options.api_type : "collections"
    );

    memory_buffer_t resp_buf = { NULL, 0 };
    struct curl_slist *headers = NULL;
    headers = curl_slist_append(headers, "Content-Type: application/json");

    curl_easy_setopt(curl, CURLOPT_URL, edms_url);
    curl_easy_setopt(curl, CURLOPT_POST, 1L);
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, json_body);
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_memory_callback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, (void *)&resp_buf);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, (long)options.timeout_sec);
    curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 0L);
    curl_easy_setopt(curl, CURLOPT_SSL_VERIFYHOST, 0L);

    CURLcode res = curl_easy_perform(curl);
    long http_status = 0;
    curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &http_status);

    free(json_body);
    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);

    if (res != CURLE_OK) {
        snprintf(err_buf, err_buf_len, "EDMS connection error: %s", curl_easy_strerror(res));
        if (resp_buf.memory) free(resp_buf.memory);
        edms_out->code = HT_STATUS_INTERNAL_ERROR;
        return false;
    }

    // 3. Parse HTTP response or initial envelope and extract transaction_id
    char transaction_id[128] = {0};
    if (resp_buf.memory) {
        cJSON *root202 = cJSON_Parse(resp_buf.memory);
        if (root202) {
            cJSON *tx_item = cJSON_GetObjectItem(root202, "transaction_id");
            if (tx_item && cJSON_IsString(tx_item) && tx_item->valuestring) {
                strncpy(transaction_id, tx_item->valuestring, sizeof(transaction_id) - 1);
            }
            cJSON_Delete(root202);
        }
        parse_edms_result_json(resp_buf.memory, edms_out);
        free(resp_buf.memory);
    }

    // 4. RWR (Request-WebSocket-Response) protocol:
    // If EDMS accepted with 202, wait on WebSocket with timeout for the final code
    if ((http_status == 202 || (http_status == 200 && edms_out->code == HT_STATUS_UNKNOWN)) && options.use_websocket) {
        bool ws_ok = listen_edms_websocket(
            options.edms_host ? options.edms_host : "localhost:3000",
            options.timeout_sec > 0 ? options.timeout_sec : 15,
            edms_out
        );
        // Fallback: If WebSocket missed the broadcast (job finished before connect),
        // query /jobs/:id per Dev API design
        if (!ws_ok && transaction_id[0] != '\0' && (edms_out->endpoint_id[0] == '\0' || edms_out->code == HT_STATUS_OK)) {
            fetch_edms_job_result(
                options.edms_host ? options.edms_host : "localhost:3000",
                transaction_id,
                options.timeout_sec > 0 ? options.timeout_sec : 15,
                edms_out
            );
        }
    }

    // If EDMS returns 200 or 202, consider delivery successful
    if (http_status == 200 || http_status == 202) {
        return true;
    }

    snprintf(err_buf, err_buf_len, "EDMS returned HTTP %ld", http_status);
    return false;
}

ht_response_t ht_request(
    const char *url,
    const char *payload,
    const char *crud,
    ht_options_t options
) {
    ht_response_t final_res;
    memset(&final_res, 0, sizeof(ht_response_t));
    final_res.edms.code = HT_STATUS_UNKNOWN;
    final_res.success = false;

    if (!url || strlen(url) == 0) {
        snprintf(final_res.error_msg, sizeof(final_res.error_msg), "Target URL is required");
        final_res.edms.code = HT_STATUS_MISSING_PARAM;
        return final_res;
    }

    // ── STEP 1: Execute Target Internet Request via libcurl ────────────────────
    CURL *curl = curl_easy_init();
    if (!curl) {
        snprintf(final_res.error_msg, sizeof(final_res.error_msg), "Failed to initialize libcurl");
        return final_res;
    }

    memory_buffer_t body_buf = { NULL, 0 };
    memory_buffer_t hdr_buf = { NULL, 0 };
    struct curl_slist *headers = NULL;

    curl_easy_setopt(curl, CURLOPT_URL, url);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_memory_callback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, (void *)&body_buf);
    curl_easy_setopt(curl, CURLOPT_HEADERFUNCTION, write_memory_callback);
    curl_easy_setopt(curl, CURLOPT_HEADERDATA, (void *)&hdr_buf);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, (long)options.timeout_sec);
    curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
    curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 0L);
    curl_easy_setopt(curl, CURLOPT_SSL_VERIFYHOST, 0L);

    // Apply HTTP Method
    if (crud && strcasecmp(crud, "GET") == 0) {
        curl_easy_setopt(curl, CURLOPT_HTTPGET, 1L);
    } else if (crud && strcasecmp(crud, "POST") == 0) {
        curl_easy_setopt(curl, CURLOPT_POST, 1L);
        if (payload) {
            curl_easy_setopt(curl, CURLOPT_POSTFIELDS, payload);
            headers = curl_slist_append(headers, "Content-Type: application/json");
        }
    } else if (crud && (strcasecmp(crud, "PUT") == 0 || strcasecmp(crud, "DELETE") == 0 || strcasecmp(crud, "PATCH") == 0)) {
        curl_easy_setopt(curl, CURLOPT_CUSTOMREQUEST, crud);
        if (payload) {
            curl_easy_setopt(curl, CURLOPT_POSTFIELDS, payload);
            headers = curl_slist_append(headers, "Content-Type: application/json");
        }
    }

    if (headers) {
        curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    }

    // Execute internet request
    CURLcode curl_res = curl_easy_perform(curl);
    long http_status = 0;
    curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &http_status);

    if (headers) {
        curl_slist_free_all(headers);
    }
    curl_easy_cleanup(curl);

    // Populate target response
    final_res.response.status_code = http_status;
    final_res.response.body = body_buf.memory;
    final_res.response.body_len = body_buf.size;
    final_res.response.headers = hdr_buf.memory;

    if (curl_res != CURLE_OK) {
        snprintf(final_res.error_msg, sizeof(final_res.error_msg), "Internet request failed: %s", curl_easy_strerror(curl_res));
        if (curl_res == CURLE_OPERATION_TIMEDOUT) {
            final_res.edms.code = HT_STATUS_TEST_TIMED_OUT;
            strncpy(final_res.edms.name, "TEST_TIMED_OUT", sizeof(final_res.edms.name) - 1);
        } else {
            final_res.edms.code = HT_STATUS_TEST_FAILED;
            strncpy(final_res.edms.name, "TEST_FAILED", sizeof(final_res.edms.name) - 1);
        }
        return final_res;
    }

    final_res.success = true;

    // ── STEP 2: Mirror EQP Snapshot into EDMS ─────────────────────────────────
    char edms_err[256] = {0};
    bool edms_ok = send_to_edms(
        url,
        crud ? crud : "GET",
        payload,
        body_buf.memory ? body_buf.memory : "",
        hdr_buf.memory ? hdr_buf.memory : "",
        options,
        &final_res.edms,
        edms_err,
        sizeof(edms_err)
    );

    if (!edms_ok && strlen(edms_err) > 0) {
        strncpy(final_res.error_msg, edms_err, sizeof(final_res.error_msg) - 1);
    }

    return final_res;
}

ht_response_t ht_request_v(
    const char *url,
    const char *payload,
    const char *crud,
    ...
) {
    ht_options_t options = ht_default_options();

    va_list args;
    va_start(args, crud);

    const char *key = NULL;
    while ((key = va_arg(args, const char *)) != NULL) {
        if (strcasecmp(key, "timeout") == 0) {
            options.timeout_sec = va_arg(args, int);
        } else if (strcasecmp(key, "collection") == 0) {
            options.collection = va_arg(args, const char *);
        } else if (strcasecmp(key, "edms_host") == 0) {
            options.edms_host = va_arg(args, const char *);
        } else if (strcasecmp(key, "use_https") == 0) {
            options.use_https = (bool)va_arg(args, int);
        } else if (strcasecmp(key, "headers") == 0) {
            options.headers_json = va_arg(args, const char *);
        } else if (strcasecmp(key, "api_type") == 0) {
            options.api_type = va_arg(args, const char *);
        }
    }
    va_end(args);

    return ht_request(url, payload, crud, options);
}

void ht_response_free(ht_response_t *resp)
{
    if (!resp) return;
    if (resp->response.body) {
        free(resp->response.body);
        resp->response.body = NULL;
    }
    if (resp->response.headers) {
        free(resp->response.headers);
        resp->response.headers = NULL;
    }
    resp->response.body_len = 0;
}

