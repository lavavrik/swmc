// Local runner. Only the package-level Handle/Init in the server root are
// what a serverless functions host loads; this wraps them in net/http.
package main

import (
	"log"
	"net/http"
	"os"

	handler "swmc/server"
)

func main() {
	if err := handler.Init(); err != nil {
		log.Fatal(err)
	}
	addr := ":8080"
	if p := os.Getenv("PORT"); p != "" {
		addr = ":" + p
	}
	log.Printf("swmc library on %s", addr)
	log.Fatal(http.ListenAndServe(addr, http.HandlerFunc(handler.Handle)))
}
