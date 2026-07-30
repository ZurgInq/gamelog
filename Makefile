.PHONY: run
run:
	./builder/bin/main

.PHONY: build
build: ./builder/main.go
	go -C ./builder build -o bin/main main.go
