package main

import (
	"html/template"
	"io/ioutil"
	"log"
	"os"
	"strings"
)

var destDir = "site"
var pagesDir = "pages"
var layoutsDir = "layouts"

func main() {
	var output *os.File

	dirInfo, err := ioutil.ReadDir("pages")
	if err != nil {
		log.Fatal(err)
	}

	for _, info := range dirInfo {
		if info.IsDir() || !strings.HasSuffix(info.Name(), ".tmpl.html") {
			log.Printf("Skip file %s\n", info.Name())
			continue
		}
		templateName := info.Name()
		tmpl := template.Must(
			template.ParseFiles(
				pagesDir+"/"+templateName,
				layoutsDir+"/layout.tmpl.html",
			),
		)

		pageName := strings.TrimSuffix(templateName, ".tmpl.html") + ".html"
		dest := destDir + "/" + pageName
		if output, err = os.Create(destDir + "/" + pageName); err != nil {
			log.Fatalf("create file: %s %s", pageName, err)
		}
		if err := tmpl.ExecuteTemplate(output, "base", nil); err != nil {
			log.Fatalf("execute template: %s %s", templateName, err)
		}
		log.Printf("%s created", dest)
	}
}
