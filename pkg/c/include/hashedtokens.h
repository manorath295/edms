/**
 * @file hashedtokens.h
 * @brief EDMS Client Library (C Wrapper) for HashedTokens API
 *
 * Provides a clean, idiomatic C wrapper around REST APIs to execute
 * endpoint requests and automatically mirror the EQP data to EDMS.
 *
 * Matches the specification in pkg/README.md and pkg/status_codes.md.
 */

#ifndef HASHEDTOKENS_H
#define HASHEDTOKENS_H

#include <stddef.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Standardized EDMS Status Codes (matching pkg/status_codes.md)
 */
typedef enum {
    HT_STATUS_OK                  = 0,
    HT_STATUS_UNKNOWN             = -1,
    HT_STATUS_INVALID_REQUEST     = 100,
    HT_STATUS_MISSING_PARAM       = 101,
    HT_STATUS_UNKNOWN_OP          = 102,
    HT_STATUS_INVALID_PARAM       = 103,
    HT_STATUS_DUPLICATE_QP        = 104,
    HT_STATUS_TEST_FAILED         = 105,
    HT_STATUS_TEST_TIMED_OUT      = 106,
    HT_STATUS_COMPUTE_UNAVAILABLE = 107,
    HT_STATUS_COMPUTE_STALLED     = 108,
    HT_STATUS_INTERNAL_ERROR      = 109
} ht_status_code_t;

/**
 * @brief EDMS WebSocket / Ingestion Result
 */
typedef struct {
    int code;                      /**< Status code (e.g. 0 for OK, 104 for DUPLICATE_QP) */
    char name[64];                 /**< Status name string (e.g. "OK", "DUPLICATE_QP") */
    char message[256];             /**< Human-readable status description */
    char endpoint_id[64];          /**< Canonical endpoint ID in EDMS (e.g. "EID-1") */
    int request_number;            /**< QP request index assigned by EDMS */
    int duplicate_of;              /**< QP number this request duplicates, if any */
    bool endpoint_created;         /**< True if endpoint was newly registered */
    bool collection_created;       /**< True if collection was newly registered */
    char detail[256];              /**< Optional error / log details */
} ht_edms_response_t;

/**
 * @brief Live Internet Target Response
 */
typedef struct {
    long status_code;              /**< HTTP status code (200, 201, 400, 500, etc.) */
    char *headers;                 /**< Raw response headers */
    char *body;                    /**< Response body */
    size_t body_len;               /**< Length of body in bytes */
} ht_target_response_t;

/**
 * @brief Combined Result returned to the user: (response_obj, ht_response)
 */
typedef struct {
    ht_target_response_t response; /**< Live response from target internet endpoint */
    ht_edms_response_t edms;       /**< EDMS ingestion and verification status */
    bool success;                  /**< True if target request succeeded */
    char error_msg[256];           /**< Internal error description if any step failed */
} ht_response_t;

/**
 * @brief Optional Configuration Parameters
 */
typedef struct {
    int timeout_sec;               /**< Request & WebSocket timeout in seconds (default: 15) */
    const char *collection;        /**< Target collection name (default: "default") */
    const char *headers_json;      /**< Custom request headers JSON string or NULL */
    const char *edms_host;         /**< EDMS webserver host (default: "localhost:3000") */
    bool use_https;                /**< Use https/wss for EDMS server (default: false) */
    const char *api_type;          /**< Ingestion target: "collections" or "history" (default: "collections") */
    bool use_websocket;            /**< Listen on WS for final RWR status code (default: true) */
} ht_options_t;

/**
 * @brief Returns default options with 15-second timeout and localhost:3000
 */
ht_options_t ht_default_options(void);

/**
 * @brief Primary wrapper function to execute an HTTP request and mirror it into EDMS.
 *
 * @param url Target internet URL (e.g. "https://api.github.com/zen")
 * @param payload Request body payload JSON (or NULL for GET/HEAD)
 * @param crud HTTP Method: "GET", "POST", "PUT", "DELETE", "PATCH", etc.
 * @param options Optional parameters (timeout, collection, headers, edms_host)
 * @return ht_response_t Combined response containing the live target result and EDMS status
 */
ht_response_t ht_request(
    const char *url,
    const char *payload,
    const char *crud,
    ht_options_t options
);

/**
 * @brief Variadic wrapper supporting key-value optional arguments, terminated with NULL.
 *
 * Example:
 *   ht_request_v("https://api.com/users", NULL, "GET",
 *                "timeout", 15,
 *                "collection", "my_api",
 *                NULL);
 */
ht_response_t ht_request_v(
    const char *url,
    const char *payload,
    const char *crud,
    ...
);

/**
 * @brief Frees dynamically allocated memory in an ht_response_t structure.
 *
 * @param resp Pointer to response structure to clean up
 */
void ht_response_free(ht_response_t *resp);

#ifdef __cplusplus
}
#endif

#endif /* HASHEDTOKENS_H */

