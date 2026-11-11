/**
 * @file main.c
 * @brief Example usage of the HashedTokens C wrapper for EDMS
 */

#include <stdio.h>
#include "hashedtokens.h"

int main(void)
{
    printf("=========================================\n");
    printf(" HashedTokens C Client Library (Demo)\n");
    printf("=========================================\n\n");

    // 1. Example GET request to a real public REST API (JSONPlaceholder)
    const char *target_url = "https://jsonplaceholder.typicode.com/todos/2";
    printf("[1] Making GET request to: %s\n", target_url);

    ht_options_t options = ht_default_options();
    options.collection = "external_live_apis";
    options.headers_json = "{\"Accept\": \"application/json\", \"User-Agent\": \"HashedTokens-C-Demo/1.0\"}";
    options.timeout_sec = 10;

    ht_response_t res = ht_request(target_url, NULL, "GET", options);

    printf("  -> HTTP Status Code: %ld\n", res.response.status_code);
    printf("  -> EDMS Status Code: %d (%s)\n", res.edms.code, res.edms.name[0] ? res.edms.name : "DELIVERED");
    printf("  -> Endpoint ID:      %s\n", res.edms.endpoint_id[0] ? res.edms.endpoint_id : "N/A");
    printf("  -> Request Number:   %d\n", res.edms.request_number);
    if (res.error_msg[0]) {
        printf("  -> Detail / Error:   %s\n", res.error_msg);
    }
    if (res.response.body) {
        printf("  -> Body Preview:     %.80s...\n", res.response.body);
    }
    ht_response_free(&res);

    // 2. Example POST request (Creating a new post on dummyjson API)
    printf("\n[2] Making POST request to DummyJSON API...\n");
    const char *post_url = "https://dummyjson.com/posts/add";
    const char *post_body = "{\"title\": \"Testing EDMS C SDK\", \"userId\": 5}";

    ht_response_t post_res = ht_request_v(
        post_url,
        post_body,
        "POST",
        "collection", "external_live_apis",
        "timeout", 15,
        NULL
    );

    printf("  -> HTTP Status Code: %ld\n", post_res.response.status_code);
    printf("  -> EDMS Status Code: %d\n", post_res.edms.code);
    ht_response_free(&post_res);

    printf("\nDemo completed successfully.\n");
    return 0;
}

