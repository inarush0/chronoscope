package main

import (
	"crypto/sha256"
	"embed"
	"encoding/base64"
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
// The directive is file-scoped and binds to the var beneath it, so distFS and
// its //go:embed line move together or the package stops compiling.
//
//go:embed all:dist
var distFS embed.FS

// Everything under assets/ is content-hashed by Vite, so its URL changes
// whenever its bytes do and it can be cached forever. index.html, robots.txt
// and chronoscope.json ship under stable URLs and must revalidate — otherwise
// a rebuilt dataset is served stale from the browser cache.
const (
	immutableCacheControl  = "public, max-age=31536000, immutable"
	revalidateCacheControl = "no-cache"
)

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

// etags hashes every embedded file once at startup — a dozen-odd files, so the
// cost is paid before the listener opens and never again.
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
