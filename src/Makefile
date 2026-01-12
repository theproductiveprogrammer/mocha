# Mocha - Log Viewer
# Makefile for C backend

CC = clang
CFLAGS = -Wall -Wextra -O2 -I../lib
LDFLAGS = -L../lib -lwebui-2-static -framework Cocoa -framework WebKit -lpthread

# Output binary
TARGET = ../mocha

# Source files
SRCS = main.c
OBJS = $(SRCS:.c=.o)

.PHONY: all clean

all: $(TARGET)

$(TARGET): $(OBJS)
	$(CC) $(OBJS) -o $(TARGET) $(LDFLAGS)
	@echo "Build complete: $(TARGET)"

%.o: %.c
	$(CC) $(CFLAGS) -c $< -o $@

clean:
	rm -f $(OBJS) $(TARGET)

# Debug build
debug: CFLAGS += -g -O0 -DDEBUG
debug: $(TARGET)
