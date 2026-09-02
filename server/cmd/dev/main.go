// Local runner. CloudHost never sees this file — only the package-level
// Handle/Init in the server root are uploaded to the functions service.
package main

import (
	"log"
	"net/http"
	"os"

	handler "swmc/server"
)

func main() {
	if os.Getenv("DATA_DIR") == "" {
		_ = os.Setenv("DATA_DIR", "data")
	}
	if err := handler.Init(); err != nil {
		log.Fatal(err)
	}
	addr := ":8080"
	if p := os.Getenv("PORT"); p != "" {
		addr = ":" + p
	}
	log.Printf("swmc library on %s (DATA_DIR=%s)", addr, os.Getenv("DATA_DIR"))
	log.Fatal(http.ListenAndServe(addr, http.HandlerFunc(handler.Handle)))
}
