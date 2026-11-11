/*
  Copyright (c) 2009-2017 Dave Gamble and cJSON contributors
  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:
  The above copyright notice and this permission notice shall be included in
  all copies or substantial portions of the Software.
*/

#include <string.h>
#include <stdio.h>
#include <math.h>
#include <stdlib.h>
#include <float.h>
#include <limits.h>
#include <ctype.h>
#include <stdbool.h>

#include "cJSON.h"

static void *(*global_malloc)(size_t sz) = malloc;
static void (*global_free)(void *ptr) = free;

static char *cJSON_strdup(const char *str)
{
    size_t len = 0;
    char *copy = NULL;
    if (!str) return NULL;
    len = strlen(str) + 1;
    copy = (char *)global_malloc(len);
    if (!copy) return NULL;
    memcpy(copy, str, len);
    return copy;
}

static cJSON *cJSON_New_Item(void)
{
    cJSON *node = (cJSON *)global_malloc(sizeof(cJSON));
    if (node) memset(node, 0, sizeof(cJSON));
    return node;
}

void cJSON_Delete(cJSON *item)
{
    cJSON *next = NULL;
    while (item != NULL)
    {
        next = item->next;
        if (!(item->type & cJSON_IsReference) && (item->child != NULL))
        {
            cJSON_Delete(item->child);
        }
        if (!(item->type & cJSON_IsReference) && (item->valuestring != NULL))
        {
            global_free(item->valuestring);
        }
        if (!(item->type & cJSON_StringIsConst) && (item->string != NULL))
        {
            global_free(item->string);
        }
        global_free(item);
        item = next;
    }
}

static const char *parse_value(cJSON * const item, const char * const input);
static const char *parse_string(cJSON * const item, const char * const input);
static const char *parse_number(cJSON * const item, const char * const input);
static const char *parse_array(cJSON * const item, const char * const input);
static const char *parse_object(cJSON * const item, const char * const input);

static const char *skip_whitespace(const char *in)
{
    while (in && *in && ((unsigned char)*in <= 32)) in++;
    return in;
}

cJSON *cJSON_Parse(const char *value)
{
    cJSON *c = cJSON_New_Item();
    if (!c) return NULL;
    const char *end = parse_value(c, skip_whitespace(value));
    if (!end)
    {
        cJSON_Delete(c);
        return NULL;
    }
    return c;
}

static const char *parse_string(cJSON * const item, const char * const input)
{
    const char *ptr = input + 1;
    char *out = NULL;
    size_t len = 0;

    if (*input != '\"') return NULL;

    while (*ptr != '\"' && *ptr)
    {
        if (*ptr++ == '\\') ptr++;
        len++;
    }

    out = (char *)global_malloc(len + 1);
    if (!out) return NULL;

    ptr = input + 1;
    char *ptr2 = out;
    while (*ptr != '\"' && *ptr)
    {
        if (*ptr != '\\')
        {
            *ptr2++ = *ptr++;
        }
        else
        {
            ptr++;
            switch (*ptr)
            {
                case 'b': *ptr2++ = '\b'; break;
                case 'f': *ptr2++ = '\f'; break;
                case 'n': *ptr2++ = '\n'; break;
                case 'r': *ptr2++ = '\r'; break;
                case 't': *ptr2++ = '\t'; break;
                case '\"':
                case '\\':
                case '/': *ptr2++ = *ptr; break;
                default: *ptr2++ = *ptr; break;
            }
            ptr++;
        }
    }
    *ptr2 = '\0';
    if (*ptr == '\"') ptr++;
    item->valuestring = out;
    item->type = cJSON_String;
    return ptr;
}

static const char *parse_number(cJSON * const item, const char * const input)
{
    double n = 0;
    char *endptr = NULL;
    n = strtod(input, &endptr);
    if (input == endptr) return NULL;

    item->valuedouble = n;
    item->valueint = (int)n;
    item->type = cJSON_Number;
    return endptr;
}

static const char *parse_array(cJSON * const item, const char * const input)
{
    const char *ptr = input + 1;
    cJSON *child = NULL;

    if (*input != '[') return NULL;
    item->type = cJSON_Array;
    ptr = skip_whitespace(ptr);
    if (*ptr == ']') return ptr + 1;

    item->child = child = cJSON_New_Item();
    if (!item->child) return NULL;
    ptr = skip_whitespace(parse_value(child, skip_whitespace(ptr)));
    if (!ptr) return NULL;

    while (*ptr == ',')
    {
        cJSON *new_item = cJSON_New_Item();
        if (!new_item) return NULL;
        child->next = new_item;
        new_item->prev = child;
        child = new_item;
        ptr = skip_whitespace(parse_value(child, skip_whitespace(ptr + 1)));
        if (!ptr) return NULL;
    }

    if (*ptr == ']') return ptr + 1;
    return NULL;
}

static const char *parse_object(cJSON * const item, const char * const input)
{
    const char *ptr = input + 1;
    cJSON *child = NULL;

    if (*input != '{') return NULL;
    item->type = cJSON_Object;
    ptr = skip_whitespace(ptr);
    if (*ptr == '}') return ptr + 1;

    item->child = child = cJSON_New_Item();
    if (!item->child) return NULL;
    ptr = skip_whitespace(parse_string(child, skip_whitespace(ptr)));
    if (!ptr) return NULL;
    child->string = child->valuestring;
    child->valuestring = NULL;

    if (*ptr != ':') return NULL;
    ptr = skip_whitespace(parse_value(child, skip_whitespace(ptr + 1)));
    if (!ptr) return NULL;

    while (*ptr == ',')
    {
        cJSON *new_item = cJSON_New_Item();
        if (!new_item) return NULL;
        child->next = new_item;
        new_item->prev = child;
        child = new_item;
        ptr = skip_whitespace(parse_string(child, skip_whitespace(ptr + 1)));
        if (!ptr) return NULL;
        child->string = child->valuestring;
        child->valuestring = NULL;

        if (*ptr != ':') return NULL;
        ptr = skip_whitespace(parse_value(child, skip_whitespace(ptr + 1)));
        if (!ptr) return NULL;
    }

    if (*ptr == '}') return ptr + 1;
    return NULL;
}

static const char *parse_value(cJSON * const item, const char * const input)
{
    if (!input) return NULL;
    if (!strncmp(input, "null", 4))  { item->type = cJSON_NULL; return input + 4; }
    if (!strncmp(input, "false", 5)) { item->type = cJSON_False; return input + 5; }
    if (!strncmp(input, "true", 4))  { item->type = cJSON_True; item->valueint = 1; return input + 4; }
    if (*input == '\"') return parse_string(item, input);
    if (*input == '-' || (*input >= '0' && *input <= '9')) return parse_number(item, input);
    if (*input == '[') return parse_array(item, input);
    if (*input == '{') return parse_object(item, input);
    return NULL;
}

static void print_string_buffer(const char *str, char **buf, size_t *cap, size_t *len)
{
    size_t slen = strlen(str);
    while (*len + slen + 4 >= *cap)
    {
        *cap *= 2;
        *buf = (char *)realloc(*buf, *cap);
    }
    (*buf)[(*len)++] = '\"';
    for (size_t i = 0; i < slen; i++)
    {
        unsigned char c = (unsigned char)str[i];
        if (c == '\"' || c == '\\')
        {
            (*buf)[(*len)++] = '\\';
            (*buf)[(*len)++] = c;
        }
        else if (c == '\n') { (*buf)[(*len)++] = '\\'; (*buf)[(*len)++] = 'n'; }
        else if (c == '\r') { (*buf)[(*len)++] = '\\'; (*buf)[(*len)++] = 'r'; }
        else if (c == '\t') { (*buf)[(*len)++] = '\\'; (*buf)[(*len)++] = 't'; }
        else { (*buf)[(*len)++] = c; }
    }
    (*buf)[(*len)++] = '\"';
    (*buf)[*len] = '\0';
}

static void print_value_unformatted(const cJSON *item, char **buf, size_t *cap, size_t *len)
{
    if (!item) return;
    char temp[64];
    size_t required = 0;

    switch (item->type & 0xFF)
    {
        case cJSON_NULL:
            required = 4;
            while (*len + required + 1 >= *cap) { *cap *= 2; *buf = (char *)realloc(*buf, *cap); }
            memcpy(*buf + *len, "null", 4);
            *len += 4;
            break;
        case cJSON_False:
            required = 5;
            while (*len + required + 1 >= *cap) { *cap *= 2; *buf = (char *)realloc(*buf, *cap); }
            memcpy(*buf + *len, "false", 5);
            *len += 5;
            break;
        case cJSON_True:
            required = 4;
            while (*len + required + 1 >= *cap) { *cap *= 2; *buf = (char *)realloc(*buf, *cap); }
            memcpy(*buf + *len, "true", 4);
            *len += 4;
            break;
        case cJSON_Number:
            if (fabs(floor(item->valuedouble) - item->valuedouble) <= DBL_EPSILON && fabs(item->valuedouble) < 1.0e14)
                snprintf(temp, sizeof(temp), "%ld", (long)item->valuedouble);
            else
                snprintf(temp, sizeof(temp), "%f", item->valuedouble);
            required = strlen(temp);
            while (*len + required + 1 >= *cap) { *cap *= 2; *buf = (char *)realloc(*buf, *cap); }
            memcpy(*buf + *len, temp, required);
            *len += required;
            break;
        case cJSON_String:
            print_string_buffer(item->valuestring ? item->valuestring : "", buf, cap, len);
            break;
        case cJSON_Array:
            while (*len + 2 >= *cap) { *cap *= 2; *buf = (char *)realloc(*buf, *cap); }
            (*buf)[(*len)++] = '[';
            for (cJSON *child = item->child; child; child = child->next)
            {
                print_value_unformatted(child, buf, cap, len);
                if (child->next)
                {
                    while (*len + 2 >= *cap) { *cap *= 2; *buf = (char *)realloc(*buf, *cap); }
                    (*buf)[(*len)++] = ',';
                }
            }
            while (*len + 2 >= *cap) { *cap *= 2; *buf = (char *)realloc(*buf, *cap); }
            (*buf)[(*len)++] = ']';
            break;
        case cJSON_Object:
            while (*len + 2 >= *cap) { *cap *= 2; *buf = (char *)realloc(*buf, *cap); }
            (*buf)[(*len)++] = '{';
            for (cJSON *child = item->child; child; child = child->next)
            {
                print_string_buffer(child->string ? child->string : "", buf, cap, len);
                while (*len + 2 >= *cap) { *cap *= 2; *buf = (char *)realloc(*buf, *cap); }
                (*buf)[(*len)++] = ':';
                print_value_unformatted(child, buf, cap, len);
                if (child->next)
                {
                    while (*len + 2 >= *cap) { *cap *= 2; *buf = (char *)realloc(*buf, *cap); }
                    (*buf)[(*len)++] = ',';
                }
            }
            while (*len + 2 >= *cap) { *cap *= 2; *buf = (char *)realloc(*buf, *cap); }
            (*buf)[(*len)++] = '}';
            break;
    }
    (*buf)[*len] = '\0';
}

char *cJSON_PrintUnformatted(const cJSON *item)
{
    size_t cap = 256;
    size_t len = 0;
    char *buf = (char *)global_malloc(cap);
    if (!buf) return NULL;
    buf[0] = '\0';
    print_value_unformatted(item, &buf, &cap, &len);
    return buf;
}

char *cJSON_Print(const cJSON *item)
{
    return cJSON_PrintUnformatted(item);
}

cJSON *cJSON_CreateNull(void) { cJSON *item = cJSON_New_Item(); if (item) item->type = cJSON_NULL; return item; }
cJSON *cJSON_CreateTrue(void) { cJSON *item = cJSON_New_Item(); if (item) { item->type = cJSON_True; item->valueint = 1; } return item; }
cJSON *cJSON_CreateFalse(void) { cJSON *item = cJSON_New_Item(); if (item) item->type = cJSON_False; return item; }
cJSON *cJSON_CreateBool(bool b) { return b ? cJSON_CreateTrue() : cJSON_CreateFalse(); }
cJSON *cJSON_CreateNumber(double num) { cJSON *item = cJSON_New_Item(); if (item) { item->type = cJSON_Number; item->valuedouble = num; item->valueint = (int)num; } return item; }
cJSON *cJSON_CreateString(const char *string) { cJSON *item = cJSON_New_Item(); if (item) { item->type = cJSON_String; item->valuestring = cJSON_strdup(string); } return item; }
cJSON *cJSON_CreateArray(void) { cJSON *item = cJSON_New_Item(); if (item) item->type = cJSON_Array; return item; }
cJSON *cJSON_CreateObject(void) { cJSON *item = cJSON_New_Item(); if (item) item->type = cJSON_Object; return item; }

bool cJSON_AddItemToArray(cJSON *array, cJSON *item)
{
    if (!array || !item) return false;
    if (!array->child) { array->child = item; }
    else
    {
        cJSON *last = array->child;
        while (last->next) last = last->next;
        last->next = item;
        item->prev = last;
    }
    return true;
}

bool cJSON_AddItemToObject(cJSON *object, const char *string, cJSON *item)
{
    if (!object || !string || !item) return false;
    item->string = cJSON_strdup(string);
    return cJSON_AddItemToArray(object, item);
}

cJSON *cJSON_AddNullToObject(cJSON * const object, const char * const name) { cJSON *item = cJSON_CreateNull(); cJSON_AddItemToObject(object, name, item); return item; }
cJSON *cJSON_AddTrueToObject(cJSON * const object, const char * const name) { cJSON *item = cJSON_CreateTrue(); cJSON_AddItemToObject(object, name, item); return item; }
cJSON *cJSON_AddFalseToObject(cJSON * const object, const char * const name) { cJSON *item = cJSON_CreateFalse(); cJSON_AddItemToObject(object, name, item); return item; }
cJSON *cJSON_AddBoolToObject(cJSON * const object, const char * const name, const bool b) { cJSON *item = cJSON_CreateBool(b); cJSON_AddItemToObject(object, name, item); return item; }
cJSON *cJSON_AddNumberToObject(cJSON * const object, const char * const name, const double number) { cJSON *item = cJSON_CreateNumber(number); cJSON_AddItemToObject(object, name, item); return item; }
cJSON *cJSON_AddStringToObject(cJSON * const object, const char * const name, const char * const string) { cJSON *item = cJSON_CreateString(string); cJSON_AddItemToObject(object, name, item); return item; }

cJSON *cJSON_GetObjectItem(const cJSON * const object, const char * const string)
{
    if (!object || !string) return NULL;
    for (cJSON *child = object->child; child; child = child->next)
    {
        if (child->string && !strcasecmp(child->string, string)) return child;
    }
    return NULL;
}

cJSON *cJSON_GetObjectItemCaseSensitive(const cJSON * const object, const char * const string)
{
    if (!object || !string) return NULL;
    for (cJSON *child = object->child; child; child = child->next)
    {
        if (child->string && !strcmp(child->string, string)) return child;
    }
    return NULL;
}

bool cJSON_IsNumber(const cJSON * const item) { return item && ((item->type & 0xFF) == cJSON_Number); }
bool cJSON_IsString(const cJSON * const item) { return item && ((item->type & 0xFF) == cJSON_String); }
bool cJSON_IsObject(const cJSON * const item) { return item && ((item->type & 0xFF) == cJSON_Object); }
bool cJSON_IsArray(const cJSON * const item)  { return item && ((item->type & 0xFF) == cJSON_Array); }
bool cJSON_IsTrue(const cJSON * const item)   { return item && ((item->type & 0xFF) == cJSON_True); }
bool cJSON_IsFalse(const cJSON * const item)  { return item && ((item->type & 0xFF) == cJSON_False); }
bool cJSON_IsBool(const cJSON * const item)   { return item && (((item->type & 0xFF) == cJSON_True) || ((item->type & 0xFF) == cJSON_False)); }
bool cJSON_IsNull(const cJSON * const item)   { return item && ((item->type & 0xFF) == cJSON_NULL); }

