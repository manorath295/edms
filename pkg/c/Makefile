CC ?= gcc
CFLAGS ?= -Wall -Wextra -O2 -Iinclude
LDFLAGS ?= -lcurl

SRCS = src/hashedtokens.c src/cJSON.c
OBJS = $(SRCS:.c=.o)
LIB_STATIC = libhashedtokens.a

all: $(LIB_STATIC) example

$(LIB_STATIC): $(OBJS)
	ar rcs $@ $^

src/%.o: src/%.c
	$(CC) $(CFLAGS) -c $< -o $@

example: examples/main.c $(LIB_STATIC)
	$(CC) $(CFLAGS) $< -L. -lhashedtokens $(LDFLAGS) -o $@

clean:
	rm -f src/*.o $(LIB_STATIC) example example.exe

.PHONY: all clean

