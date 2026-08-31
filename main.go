// Command chronoscope serves the built frontend and the dataset artifact as a
// single self-contained binary. Everything it needs is embedded at compile
// time, so deployment is one file with nothing beside it.
//
// The frontend must be built first — `//go:embed dist` fails to compile if
// dist/ is missing:
//
//	npm run build && go build -o chronoscope .
//	npm run build:binary          # the same two steps
package main

import (
	"crypto/sha256"
	"embed"
	"encoding/base64"
	"flag"
	"io"
	"io/fs"
	"log"
	"net/http"
	"path"
	"strings"
)

// dist/ is a tree, not a flat list: Pixi 8 code-splits its renderers behind
// dynamic import(), so the embed has to recurse into assets/.
//
//go:embed all:dist
var distFS embed.FS

// Everything under assets/ is content-hashed by Vite, so its URL changes
// whenever its bytes do and it can be cached forever. index.html, favicon.svg,
// robots.txt and chronoscope.json ship under stable URLs and must revalidate —
// otherwise a rebuilt dataset is served stale from the browser cache.
const (
	immutableCacheControl  = "public, max-age=31536000, immutable"
	revalidateCacheControl = "no-cache"
)

func main() {
	addr := flag.String("addr", ":8080", "address to listen on")
	flag.Parse()

	dist, err := fs.Sub(distFS, "dist")
	if err != nil {
		log.Fatalf("chronoscope: %v", err)
	}

	log.Printf("chronoscope: listening on %s", *addr)
	if err := http.ListenAndServe(*addr, handler(dist)); err != nil {
		log.Fatalf("chronoscope: %v", err)
	}
}

// handler serves files from fsys, tagging each response with the cache policy
// its URL earns. Revalidating responses also carry an ETag: embedded files have
// a zero modification time, so without one http.FileServer has no validator to
// offer and every reload re-downloads the 531 KB dataset in full.
func handler(fsys fs.FS) http.Handler {
	files := http.FileServer(http.FS(fsys))
	etags := etags(fsys)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if name == "" || strings.HasSuffix(r.URL.Path, "/") {
			name = path.Join(name, "index.html")
		}

		if strings.HasPrefix(name, "assets/") {
			w.Header().Set("Cache-Control", immutableCacheControl)
		} else {
			w.Header().Set("Cache-Control", revalidateCacheControl)
			// http.ServeContent reads Etag off the header we set here, so this
			// is what turns a reload into a 304.
			if tag, ok := etags[name]; ok {
				w.Header().Set("Etag", tag)
			}
		}

		files.ServeHTTP(w, r)
	})
}

// etags hashes every embedded file once at startup — 13 files, so the cost is
// paid before the listener opens and never again.
func etags(fsys fs.FS) map[string]string {
	tags := make(map[string]string)

	err := fs.WalkDir(fsys, ".", func(name string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		f, err := fsys.Open(name)
		if err != nil {
			return err
		}
		defer f.Close()

		sum := sha256.New()
		if _, err := io.Copy(sum, f); err != nil {
			return err
		}
		tags[name] = `"` + base64.RawURLEncoding.EncodeToString(sum.Sum(nil)) + `"`
		return nil
	})
	if err != nil {
		log.Fatalf("chronoscope: hashing embedded files: %v", err)
	}

	return tags
}
