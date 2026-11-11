/**
 * @file test_edge_cases.c
 * @brief Comprehensive edge-case test suite for HashedTokens C Client SDK.
 */

#include <stdio.h>
#include <string.h>
#include "hashedtokens.h"

static int g_tests_run = 0;
static int g_tests_passed = 0;

#define RUN_TEST(name, func) do { \
    g_tests_run++; \
    printf("\n[TEST %d] %s...\n", g_tests_run, name); \
    if (func()) { \
        printf("  => PASS\n"); \
        g_tests_passed++; \
    } else { \
        printf("  => FAIL\n"); \
    } \
} while(0)

// Edge Case 1: NULL or Empty URL
static bool test_null_url(void)
{
    ht_options_t opt = ht_default_options();
    ht_response_t res = ht_request(NULL, NULL, "GET", opt);

    printf("  Expected EDMS Code: %d (MISSING_PARAM), Got: %d\n", HT_STATUS_MISSING_PARAM, res.edms.code);
    printf("  Error message: '%s'\n", res.error_msg);

    bool pass = (res.edms.code == HT_STATUS_MISSING_PARAM) && (!res.success);
    ht_response_free(&res);
    return pass;
}

// Edge Case 2: Non-existent / Unreachable Domain
static bool test_unreachable_domain(void)
{
    ht_options_t opt = ht_default_options();
    opt.timeout_sec = 3;
    ht_response_t res = ht_request("http://domain.that.does.not.exist.xyz.invalid", NULL, "GET", opt);

    printf("  Expected EDMS Code: %d (TEST_FAILED), Got: %d (%s)\n", 
           HT_STATUS_TEST_FAILED, res.edms.code, res.edms.name);
    printf("  Error detail: '%s'\n", res.error_msg);

    bool pass = (res.edms.code == HT_STATUS_TEST_FAILED) && (!res.success);
    ht_response_free(&res);
    return pass;
}

// Edge Case 3: Connection / Operation Timeout
static bool test_timeout(void)
{
    ht_options_t opt = ht_default_options();
    opt.timeout_sec = 1; // 1 second timeout against a slow endpoint
    ht_response_t res = ht_request("https://httpbin.org/delay/5", NULL, "GET", opt);

    printf("  Expected EDMS Code: %d (TEST_TIMED_OUT), Got: %d (%s)\n",
           HT_STATUS_TEST_TIMED_OUT, res.edms.code, res.edms.name);
    printf("  Error detail: '%s'\n", res.error_msg);

    bool pass = (res.edms.code == HT_STATUS_TEST_TIMED_OUT) && (!res.success);
    ht_response_free(&res);
    return pass;
}

// Edge Case 4: Graceful EDMS Offline Handling (Target succeeds even if EDMS is down)
static bool test_edms_offline(void)
{
    ht_options_t opt = ht_default_options();
    opt.edms_host = "127.0.0.1:49999"; // Port where nothing is running
    opt.timeout_sec = 2;

    ht_response_t res = ht_request("https://jsonplaceholder.typicode.com/todos/1", NULL, "GET", opt);

    printf("  Target HTTP Status: %ld (Expected 200)\n", res.response.status_code);
    printf("  Target Success: %s (Expected true)\n", res.success ? "true" : "false");
    printf("  EDMS Error (Expected): '%s'\n", res.error_msg);

    bool pass = (res.response.status_code == 200) && res.success;
    ht_response_free(&res);
    return pass;
}

// Edge Case 5: Variadic Parameters Defaults and Override
static bool test_variadics(void)
{
    // Calling with variadics overriding collection and timeout
    ht_response_t res = ht_request_v(
        "https://jsonplaceholder.typicode.com/todos/1",
        NULL,
        "GET",
        "collection", "edge_case_collection",
        "timeout", 5,
        NULL
    );

    printf("  Target HTTP Status: %ld\n", res.response.status_code);
    bool pass = (res.response.status_code == 200);
    ht_response_free(&res);
    return pass;
}

int main(void)
{
    printf("====================================================\n");
    printf("   HashedTokens C SDK - Comprehensive Edge Cases    \n");
    printf("====================================================\n");

    RUN_TEST("Empty / NULL URL Handling", test_null_url);
    RUN_TEST("Unreachable Domain Handling", test_unreachable_domain);
    RUN_TEST("Request Timeout Handling", test_timeout);
    RUN_TEST("EDMS Offline Graceful Degradation", test_edms_offline);
    RUN_TEST("Variadic Options Processing", test_variadics);

    printf("\n====================================================\n");
    printf("   Results: %d / %d Tests Passed\n", g_tests_passed, g_tests_run);
    printf("====================================================\n");

    return (g_tests_passed == g_tests_run) ? 0 : 1;
}

