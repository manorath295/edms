# HashedTokens EDMS Client Library (C Wrapper)

A lightweight, non-blocking C client library for integrating any C application with the EDMS (Endpoint Documentation & Management System) Developer API.

It allows developers to execute HTTP requests against external APIs and automatically persist the request, response, and metadata snapshot (EQP pair) into EDMS with a single function call.

---

## Features

- **Single Function API:** Execute an HTTP call and store it in EDMS in one line.
- **`libcurl` Powered:** Reliable, industry-standard HTTP transport.
- **Embedded JSON Engine:** Self-contained `cJSON` for zero extra dependencies.
- **Dual Option Formats:** Supports both structured `ht_options_t` and variadic key-value arguments (`ht_request_v`).
- **Standardized Status Codes:** Full support for EDMS status codes defined in [`pkg/status_codes.md`](../status_codes.md) (e.g. `0 OK`, `104 DUPLICATE_QP`, `101 MISSING_PARAM`).

---

## Installation & Build

### Requirements
- A C99-compliant compiler (`gcc`, `clang`, or MSVC)
- `libcurl` development library (`libcurl-dev` / `libcurl-devel`)

### Building with Makefile
```bash
cd pkg/c
make
```
This generates `libhashedtokens.a` and the `example` test binary.

### Building with CMake
```bash
cd pkg/c
mkdir build && cd build
cmake ..
cmake --build .
```

---

## Usage Example

```c
#include <stdio.h>
#include "hashedtokens.h"

int main(void) {
    const char *url = "https://httpbin.org/get";
    
    // 1. Basic GET request with default options (15s timeout, default collection)
    ht_options_t options = ht_default_options();
    options.collection = "payments_v1";

    ht_response_t res = ht_request(url, NULL, "GET", options);

    printf("HTTP Status: %ld\n", res.response.status_code);
    printf("EDMS Code:   %d (%s)\n", res.edms.code, res.edms.name);
    printf("Endpoint ID: %s\n", res.edms.endpoint_id);
    printf("QP Number:   %d\n", res.edms.request_number);
    printf("Response:    %s\n", res.response.body);

    // Free response resources
    ht_response_free(&res);

    // 2. POST request using variadic options
    const char *body = "{\"amount\": 100, \"currency\": \"USD\"}";
    ht_response_t post_res = ht_request_v(
        "https://httpbin.org/post",
        body,
        "POST",
        "collection", "payments_v1",
        "timeout", 20,
        NULL
    );

    printf("POST HTTP Status: %ld\n", post_res.response.status_code);
    ht_response_free(&post_res);

    return 0;
}
```

---

## API Reference

### `ht_request`
```c
ht_response_t ht_request(
    const char *url,
    const char *payload,
    const char *crud,
    ht_options_t options
);
```
- `url`: Target internet URL string.
- `payload`: Request body JSON string (or `NULL` for `GET`/`DELETE`).
- `crud`: HTTP method string (`"GET"`, `"POST"`, `"PUT"`, `"DELETE"`, etc.).
- `options`: `ht_options_t` struct with timeout, collection name, headers, and EDMS host.

### `ht_request_v`
```c
ht_response_t ht_request_v(const char *url, const char *payload, const char *crud, ...);
```
Variadic version accepting key-value pairs terminated with `NULL`:
- `"timeout"`, `(int)seconds`
- `"collection"`, `(const char *)name`
- `"edms_host"`, `(const char *)"localhost:3000"`
- `"headers"`, `(const char *)json_headers`

### `ht_response_free`
```c
void ht_response_free(ht_response_t *resp);
```
Frees dynamically allocated memory associated with the target response body and headers.

