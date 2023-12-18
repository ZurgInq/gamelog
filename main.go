package main

import (
	"bytes"
	"fmt"
	"html/template"
	"io/ioutil"
	"log"
	"os"
	"strings"

	"github.com/pkg/errors"
)

var destDir = "docs"
var pagesDir = "pages"
var layoutsDir = "layouts"
var jsTmplPrefix = "js:"

var tmplFuncs = template.FuncMap{
	"args": func(args ...any) map[string]any {
		result := make(map[string]any, len(args)/2)
		for i := 0; i < len(args); i = i + 2 {
			result[fmt.Sprint(args[i])] = args[i+1]
		}

		return result
	},
	"title": strings.Title,
}

func main() {
	dirInfo, err := ioutil.ReadDir(pagesDir)
	if err != nil {
		log.Fatal(err)
	}

	for _, info := range dirInfo {
		if info.IsDir() || !strings.HasSuffix(info.Name(), ".tmpl.html") {
			log.Printf("Skip file %s\n (wrong extension)", info.Name())
			continue
		}
		templateName := info.Name()
		tmpl, pageName := parsePage(templateName)

		if err = defineJsTemplates(tmpl); err != nil {
			log.Fatalln(err)
		}

		tmpl.Funcs(tmplFuncs)
		dest, err := compilePage(tmpl, pageName)
		if err != nil {
			log.Fatalf("complie %s %s", pageName, err)
		}
		log.Printf("%s created", dest)
	}
}

func parsePage(templateName string) (*template.Template, string) {
	tmpl := template.Must(
		template.New(templateName).Funcs(tmplFuncs).ParseFiles(
			pagesDir+"/"+templateName,
			layoutsDir+"/layout.tmpl.html",
		),
	)
	pageName := strings.TrimSuffix(templateName, ".tmpl.html") + ".html"
	return tmpl, pageName
}

func defineJsTemplates(tmpl *template.Template) error {
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

	return err
}

func compilePage(tmpl *template.Template, pageName string) (string, error) {
	var output *os.File
	var err error
	dest := destDir + "/" + pageName
	if output, err = os.Create(dest); err != nil {
		return dest, errors.Wrapf(err, "create file %s", pageName)
	}
	if err := tmpl.ExecuteTemplate(output, "base", nil); err != nil {
		return dest, errors.Wrap(err, "execute template")
	}

	return dest, nil
}
