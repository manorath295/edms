cmake_minimum_required(VERSION 3.10)
project(hashedtokens_c C)

set(CMAKE_C_STANDARD 99)

find_package(CURL REQUIRED)

include_directories(include ${CURL_INCLUDE_DIRS})

add_library(hashedtokens STATIC
    src/hashedtokens.c
    src/cJSON.c
)
target_link_libraries(hashedtokens ${CURL_LIBRARIES})

add_executable(example examples/main.c)
target_link_libraries(example hashedtokens ${CURL_LIBRARIES})

