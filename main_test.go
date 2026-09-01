package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"
)

// handler takes an fs.FS rather than reaching for distFS directly, so these
// tests run against a stand-in tree instead of the real build output. The names
// mirror what Vite emits: content-hashed files under assets/, everything else
// at a stable URL.
//
// The package still needs a dist/ directory to compile at all — `//go:embed
// dist` is a compile-time read — so `npm run build` has to have run before
// `go test` will build this file.
func testFS() fstest.MapFS {
	return fstest.MapFS{
		"index.html":            {Data: []byte("<!doctype html>")},
		"robots.txt":            {Data: []byte("User-agent: *\n")},
		"chronoscope.json":      {Data: []byte(`{"events":[]}`)},
		"assets/main-a1b2c3.js": {Data: []byte("console.log(0)")},
	}
}

func get(t *testing.T, h http.Handler, target string, header http.Header) *http.Response {
	t.Helper()

	req := httptest.NewRequest(http.MethodGet, target, nil)
	for k, v := range header {
		req.Header[k] = v
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	return rec.Result()
}

// The invariant the ETag exists for: embedded files have a zero modification
// time, so http.FileServer has no validator of its own to offer and a reload
// re-downloads the whole 531 KB dataset. The startup-computed hash is what
// turns the second request into a 304.
func TestRevalidationReturnsNotModified(t *testing.T) {
	h := handler(testFS())

	first := get(t, h, "/chronoscope.json", nil)
	if first.StatusCode != http.StatusOK {
		t.Fatalf("first request: got %d, want 200", first.StatusCode)
	}
	etag := first.Header.Get("Etag")
	if etag == "" {
		t.Fatal("first request carried no Etag, so nothing can revalidate")
	}

	second := get(t, h, "/chronoscope.json", http.Header{"If-None-Match": {etag}})
	if second.StatusCode != http.StatusNotModified {
		t.Errorf("revalidating with %s: got %d, want 304", etag, second.StatusCode)
	}
	if n := second.ContentLength; n > 0 {
		t.Errorf("304 carried a %d-byte body", n)
	}
}

// A stale ETag must still be served in full — otherwise a rebuilt dataset would
// come back 304 and the browser would keep the old one forever.
func TestStaleEtagIsServedInFull(t *testing.T) {
	res := get(t, handler(testFS()), "/chronoscope.json",
		http.Header{"If-None-Match": {`"not-the-current-hash"`}})

	if res.StatusCode != http.StatusOK {
		t.Errorf("got %d, want 200", res.StatusCode)
	}
}

// Two files with different bytes must not share a tag, or one would revalidate
// as the other.
func TestEtagsDistinguishContent(t *testing.T) {
	h := handler(testFS())

	index := get(t, h, "/", nil).Header.Get("Etag")
	robots := get(t, h, "/robots.txt", nil).Header.Get("Etag")

	if index == robots {
		t.Errorf("index.html and robots.txt share the Etag %s", index)
	}
}

// The two cache classes. Vite content-hashes everything under assets/, so its
// URL changes whenever its bytes do and it can be cached for a year; the stable
// URLs must revalidate on every load.
func TestCacheClasses(t *testing.T) {
	h := handler(testFS())

	// "/" rather than "/index.html": http.FileServer redirects any URL ending
	// in index.html to "./", so the document is only ever fetched at the bare
	// path and that is the request whose headers matter.
	tests := []struct {
		target   string
		cache    string
		wantEtag bool
	}{
		{target: "/assets/main-a1b2c3.js", cache: immutableCacheControl},
		{target: "/", cache: revalidateCacheControl, wantEtag: true},
		{target: "/robots.txt", cache: revalidateCacheControl, wantEtag: true},
		{target: "/chronoscope.json", cache: revalidateCacheControl, wantEtag: true},
	}

	for _, tt := range tests {
		t.Run(tt.target, func(t *testing.T) {
			res := get(t, h, tt.target, nil)

			if res.StatusCode != http.StatusOK {
				t.Fatalf("got %d, want 200", res.StatusCode)
			}
			if got := res.Header.Get("Cache-Control"); got != tt.cache {
				t.Errorf("Cache-Control: got %q, want %q", got, tt.cache)
			}
			if got := res.Header.Get("Etag"); (got != "") != tt.wantEtag {
				t.Errorf("Etag %q, wantEtag %v", got, tt.wantEtag)
			}
		})
	}
}
