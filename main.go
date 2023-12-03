package main

import (
	"bytes"
	"fmt"
	"html/template"
	"io/ioutil"
	"log"
	"os"
	"strings"
)

var destDir = "docs"
var pagesDir = "pages"
var layoutsDir = "layouts"
var jsTmplPrefix = "js:"

func main() {
	var output *os.File

	dirInfo, err := ioutil.ReadDir("pages")
	if err != nil {
		log.Fatal(err)
	}

	for _, info := range dirInfo {
		if info.IsDir() || !strings.HasSuffix(info.Name(), ".tmpl.html") {
			log.Printf("Skip file %s\n (wrong extension)", info.Name())
			continue
		}
		templateName := info.Name()
		tmpl := template.Must(
			template.ParseFiles(
				pagesDir+"/"+templateName,
				layoutsDir+"/layout.tmpl.html",
			),
		)

		jsTemplates := ""
		for _, t := range tmpl.Templates() {
			tName := t.Name()
			if strings.HasPrefix(t.Name(), jsTmplPrefix) {
				jsTmplName := strings.TrimPrefix(tName, jsTmplPrefix)
				var b bytes.Buffer
				cloned, err := tmpl.Clone()
				if err != nil {
					log.Fatalln(err)
				}
				if err = cloned.ExecuteTemplate(&b, tName, nil); err != nil {
					log.Fatal(err)
				}
				jsTmpl, err := ioutil.ReadAll(&b)
				if err != nil {
					log.Fatalln(err)
				}
				jsTemplates = jsTemplates + fmt.Sprintf("%s { return `%s`; },", jsTmplName, jsTmpl)
			}
		}
		_, err := tmpl.Parse(`{{define "js-templates"}}<script>
			const templates = {` + jsTemplates + `}
	</script>{{end}}`)
		if err != nil {
			log.Fatalln(err)
		}

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
