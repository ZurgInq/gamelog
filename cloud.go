package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"path"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsHttp "github.com/aws/aws-sdk-go-v2/aws/transport/http"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/pkg/errors"
	"github.com/rs/cors"
)

const (
	appBucket  = "game-log"
	uuidHeader = "UUID"
)

var corsHandler = cors.New(cors.Options{
	AllowedOrigins: []string{"*"},
	AllowedMethods: []string{
		http.MethodHead,
		http.MethodGet,
		http.MethodPost,
		http.MethodPut,
		http.MethodPatch,
		http.MethodDelete,
	},
	AllowedHeaders:   []string{"*"},
	AllowCredentials: false,
	ExposedHeaders:   []string{"ETag"},
})
var s3Client = newS3Client(context.Background())

func dbPath(uuid string) string {
	return path.Join(uuid, "db1.json")
}

func keyExists(ctx context.Context, client *s3.Client, uuid string) (bool, error) {
	// ToDo для client.GetObjectAttributes() ошибка 403
	_, err := client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(appBucket),
		Key:    aws.String(uuid),
	})
	if err != nil {
		log.Printf("get object %s %s %s", appBucket, uuid, err)
		var respErr *awsHttp.ResponseError
		if errors.As(err, &respErr) && respErr.HTTPStatusCode() == 404 {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func Handler(rw http.ResponseWriter, req *http.Request) {
	corsHandler.Log = log.Default()
	corsHandler.HandlerFunc(rw, req)
	if req.Method == http.MethodOptions {
		return
	}

	uuid := req.Header.Get(uuidHeader)
	if uuid == "" {
		rw.WriteHeader(403)
		io.WriteString(rw, "Empty UUID")
		return
	}

	// ToDo
	// uuidExists, err := keyExists(req.Context(), s3Client, uuid)
	// if err != nil {
	// 	rw.WriteHeader(500)
	// 	return
	// }
	// if !uuidExists {
	// 	rw.WriteHeader(401)
	// 	return
	// }

	path := aws.String(dbPath(uuid))
	if req.Method == http.MethodGet {
		object, err := s3Client.GetObject(req.Context(), &s3.GetObjectInput{
			Bucket:      aws.String(appBucket),
			Key:         path,
			IfNoneMatch: aws.String(req.Header.Get("If-None-Match")),
		})
		if err != nil {
			log.Printf("get object %s %s %s", appBucket, *path, err)
			var respErr *awsHttp.ResponseError
			if errors.As(err, &respErr) {
				rw.WriteHeader(respErr.HTTPStatusCode())
				return
			}
			rw.WriteHeader(500)
			return
		}
		defer object.Body.Close()
		rw.Header().Add("ETag", *object.ETag)
		rw.Header().Add("Content-Type", "application/json")
		io.Copy(rw, object.Body)
	} else if req.Method == http.MethodPut {
		var reqBody json.RawMessage
		err := json.NewDecoder(req.Body).Decode(&reqBody)
		if err != nil {
			rw.WriteHeader(400)
			io.WriteString(rw, fmt.Sprintf("Fail decode request: %s", err.Error()))
			return
		}

		object, err := s3Client.PutObject(req.Context(), &s3.PutObjectInput{
			Bucket: aws.String(appBucket),
			Key:    path,
			Body:   strings.NewReader(string(reqBody)),
		})
		if err != nil {
			log.Printf("put object %s %s %s", appBucket, *path, err)
			rw.WriteHeader(400)
			io.WriteString(rw, fmt.Sprintf("Fail decode request: %s", err.Error()))
			return
		}
		rw.Header().Add("ETag", *object.ETag)
	}

	rw.WriteHeader(200)
}

func newS3Client(ctx context.Context) *s3.Client {
	customResolver := aws.EndpointResolverWithOptionsFunc(func(service, region string, options ...interface{}) (aws.Endpoint, error) {
		if service == s3.ServiceID && region == "ru-central1" {
			return aws.Endpoint{
				PartitionID:   "yc",
				URL:           "https://storage.yandexcloud.net",
				SigningRegion: "ru-central1",
			}, nil
		}
		return aws.Endpoint{}, fmt.Errorf("unknown endpoint requested")
	})

	cfg, err := config.LoadDefaultConfig(
		ctx,
		config.WithEndpointResolverWithOptions(customResolver),
	)
	if err != nil {
		log.Fatal(err)
	}

	return s3.NewFromConfig(cfg)
}
