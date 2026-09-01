// Command chronoscope serves the built frontend and the dataset artifact as a
// single self-contained binary. Everything it needs is embedded at compile
// time, so deployment is one file with nothing beside it.
//
// The frontend must be built first — `//go:embed dist` fails to compile if
// dist/ is missing:
//
//	npm run build && go build -o chronoscope .
//	npm run build:binary          # the same two steps
//
// This file is the entrypoint and nothing else: the embed and everything that
// serves it live in server.go, which keeps main.go a single flag-parse-and-
// listen that the coverage profile filters out by path (#54, ADR-0003).
package main

import (
	"flag"
	"io/fs"
	"log"
	"net/http"
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
