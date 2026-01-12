/*
 * Mocha - Log Viewer Application
 * C Backend using WebUI
 */

#include "../lib/webui.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <time.h>

#define MAX_FILE_SIZE (10 * 1024 * 1024)  // 10MB limit
#define MAX_RECENT 20
#define RECENT_FILE_PATH "/.mocha/recent.json"

// Helper: Get home directory
static const char* get_home(void) {
    const char* home = getenv("HOME");
    if (!home) home = getenv("USERPROFILE");  // Windows
    return home ? home : ".";
}

// Helper: Get recent file path
static void get_recent_path(char* buf, size_t len) {
    snprintf(buf, len, "%s%s", get_home(), RECENT_FILE_PATH);
}

// Helper: JSON escape a string
// Caller must free the returned string
static char* json_escape(const char* str, size_t len) {
    // Worst case: every char needs escaping (\uXXXX = 6 chars)
    char* escaped = malloc(len * 6 + 1);
    if (!escaped) return NULL;

    char* p = escaped;
    for (size_t i = 0; i < len; i++) {
        unsigned char c = (unsigned char)str[i];
        switch (c) {
            case '"':  *p++ = '\\'; *p++ = '"'; break;
            case '\\': *p++ = '\\'; *p++ = '\\'; break;
            case '\b': *p++ = '\\'; *p++ = 'b'; break;
            case '\f': *p++ = '\\'; *p++ = 'f'; break;
            case '\n': *p++ = '\\'; *p++ = 'n'; break;
            case '\r': *p++ = '\\'; *p++ = 'r'; break;
            case '\t': *p++ = '\\'; *p++ = 't'; break;
            default:
                if (c < 32) {
                    // Control character: use \uXXXX format
                    p += sprintf(p, "\\u%04x", c);
                } else {
                    *p++ = c;
                }
                break;
        }
    }
    *p = '\0';
    return escaped;
}

// Binding: readFile(path, offset)
// If offset = 0: read full file (initial load)
// If offset > 0: read only new bytes from offset to end (polling)
void read_file(webui_event_t* e) {
    const char* path = webui_get_string_at(e, 0);
    long offset = (long)webui_get_int_at(e, 1);

    if (!path || strlen(path) == 0) {
        webui_return_string(e, "{\"success\":false,\"error\":\"No path provided\"}");
        return;
    }

    // First, stat the file to get current size
    struct stat st;
    if (stat(path, &st) != 0) {
        webui_return_string(e, "{\"success\":false,\"error\":\"Cannot stat file\"}");
        return;
    }

    long current_size = st.st_size;

    // If file hasn't grown, return empty content with current size
    if (offset > 0 && current_size <= offset) {
        char response[256];
        snprintf(response, sizeof(response),
            "{\"success\":true,\"content\":\"\",\"size\":%ld,\"prevSize\":%ld}",
            current_size, offset);
        webui_return_string(e, response);
        return;
    }

    FILE* f = fopen(path, "rb");
    if (!f) {
        webui_return_string(e, "{\"success\":false,\"error\":\"Cannot open file\"}");
        return;
    }

    // Calculate how much to read
    long read_start = (offset > 0) ? offset : 0;
    long read_size = current_size - read_start;

    if (read_size > MAX_FILE_SIZE) {
        fclose(f);
        webui_return_string(e, "{\"success\":false,\"error\":\"File too large (max 10MB)\"}");
        return;
    }

    // Seek to read position
    fseek(f, read_start, SEEK_SET);

    // Read content
    char* content = malloc(read_size + 1);
    if (!content) {
        fclose(f);
        webui_return_string(e, "{\"success\":false,\"error\":\"Memory allocation failed\"}");
        return;
    }

    size_t bytes_read = fread(content, 1, read_size, f);
    content[bytes_read] = '\0';
    fclose(f);

    // Extract filename
    const char* name = strrchr(path, '/');
    if (!name) name = strrchr(path, '\\');
    name = name ? name + 1 : path;

    // JSON escape the content
    char* escaped_content = json_escape(content, bytes_read);
    free(content);

    if (!escaped_content) {
        webui_return_string(e, "{\"success\":false,\"error\":\"Failed to escape content\"}");
        return;
    }

    // Build JSON response
    size_t response_size = strlen(escaped_content) + strlen(path) + strlen(name) + 256;
    char* response = malloc(response_size);
    if (!response) {
        free(escaped_content);
        webui_return_string(e, "{\"success\":false,\"error\":\"Memory allocation failed\"}");
        return;
    }

    snprintf(response, response_size,
        "{\"success\":true,\"content\":\"%s\",\"path\":\"%s\",\"name\":\"%s\",\"size\":%ld,\"prevSize\":%ld}",
        escaped_content, path, name, current_size, offset);

    webui_return_string(e, response);

    free(escaped_content);
    free(response);
}

// Binding: getRecentFiles
void get_recent_files(webui_event_t* e) {
    char path[512];
    get_recent_path(path, sizeof(path));

    FILE* f = fopen(path, "r");
    if (!f) {
        webui_return_string(e, "[]");
        return;
    }

    fseek(f, 0, SEEK_END);
    long size = ftell(f);
    fseek(f, 0, SEEK_SET);

    if (size <= 0) {
        fclose(f);
        webui_return_string(e, "[]");
        return;
    }

    char* content = malloc(size + 1);
    if (!content) {
        fclose(f);
        webui_return_string(e, "[]");
        return;
    }

    size_t bytes_read = fread(content, 1, size, f);
    content[bytes_read] = '\0';
    fclose(f);

    webui_return_string(e, content);
    free(content);
}

// Binding: addRecentFile
void add_recent_file(webui_event_t* e) {
    const char* file_path = webui_get_string(e);

    if (!file_path || strlen(file_path) == 0) {
        return;
    }

    // Extract filename
    const char* name = strrchr(file_path, '/');
    if (!name) name = strrchr(file_path, '\\');
    name = name ? name + 1 : file_path;

    // Get current time in milliseconds
    long long now = (long long)time(NULL) * 1000;

    // Get recent file path
    char recent_path[512];
    get_recent_path(recent_path, sizeof(recent_path));

    // Create directory if needed
    char dir[512];
    snprintf(dir, sizeof(dir), "%s/.mocha", get_home());
    mkdir(dir, 0755);  // Ignore error if exists

    // Read existing recent files
    FILE* f = fopen(recent_path, "r");
    char* existing = NULL;
    long existing_size = 0;

    if (f) {
        fseek(f, 0, SEEK_END);
        existing_size = ftell(f);
        fseek(f, 0, SEEK_SET);
        if (existing_size > 0) {
            existing = malloc(existing_size + 1);
            if (existing) {
                size_t bytes_read = fread(existing, 1, existing_size, f);
                existing[bytes_read] = '\0';
            }
        }
        fclose(f);
    }

    // Build new JSON array
    size_t new_json_size = strlen(file_path) + strlen(name) +
                           (existing ? strlen(existing) : 0) + 256;
    char* new_json = malloc(new_json_size);

    if (!new_json) {
        free(existing);
        return;
    }

    if (existing && strlen(existing) > 2) {
        // Insert at beginning of existing array
        snprintf(new_json, new_json_size,
            "[{\"path\":\"%s\",\"name\":\"%s\",\"lastOpened\":%lld},%s",
            file_path, name, now, existing + 1);  // Skip opening [
    } else {
        snprintf(new_json, new_json_size,
            "[{\"path\":\"%s\",\"name\":\"%s\",\"lastOpened\":%lld}]",
            file_path, name, now);
    }

    // Write back
    f = fopen(recent_path, "w");
    if (f) {
        fputs(new_json, f);
        fclose(f);
    }

    free(existing);
    free(new_json);
}

int main(int argc, char* argv[]) {
    // Check for --headless flag (for testing)
    int headless = 0;
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--headless") == 0) {
            headless = 1;
            break;
        }
    }

    // Enable multi-client mode for testing
    webui_set_config(multi_client, true);

    // Don't wait for connection in headless mode
    if (headless) {
        webui_set_config(show_wait_connection, false);
    }

    // Create new window
    size_t win = webui_new_window();

    // Register bindings
    webui_bind(win, "readFile", read_file);
    webui_bind(win, "getRecentFiles", get_recent_files);
    webui_bind(win, "addRecentFile", add_recent_file);

    // Serve frontend from dist folder
    webui_set_root_folder(win, "./dist");

    if (headless) {
        // Start server only (no browser window) for testing
        const char* url = webui_start_server(win, "index.html");
        if (!url) {
            fprintf(stderr, "Failed to start server\n");
            return 1;
        }
        printf("Server started at: %s\n", url);
        fflush(stdout);
    } else {
        // Show window with index.html
        if (!webui_show(win, "index.html")) {
            fprintf(stderr, "Failed to open browser window\n");
            return 1;
        }
    }

    // Wait for window to close (or Ctrl+C in headless mode)
    webui_wait();

    return 0;
}
