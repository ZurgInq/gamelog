package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsHttp "github.com/aws/aws-sdk-go-v2/aws/transport/http"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/gofrs/uuid"
	"github.com/pkg/errors"
	"github.com/rs/cors"
)

const (
	appBucket    = "game-log"
	uuidHeader   = "UUID"
	apiKeyEnv    = "API_KEY"
	apiKeyHeader = "APIKey"
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

func Handler(rw http.ResponseWriter, req *http.Request) {
	corsHandler.Log = log.Default()
	corsHandler.HandlerFunc(rw, req)

	if req.Method == http.MethodOptions {
		return
	} else if req.Method == http.MethodGet {
		getDBHandler(rw, req)
	} else if req.Method == http.MethodPut {
		saveDBHandler(rw, req)
	} else {
		rw.WriteHeader(204)
	}
}

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

func fetchCredentionals(req *http.Request) (uuid.UUID, string, error) {
	reqUUID, err := uuid.FromString(req.Header.Get(uuidHeader))
	if err != nil {
		return uuid.Nil, "", errors.Wrap(err, "invalid UUID")
	}

	reqAPIKey := req.Header.Get(apiKeyHeader)
	if reqAPIKey == "" {
		return uuid.Nil, "", errors.Wrap(err, "Empty APIKey header")
	}
	return reqUUID, reqAPIKey, nil
}

func validateRequestCredentionals(rw http.ResponseWriter, req *http.Request) (uuid.UUID, bool) {
	userUUID, apiKey, err := fetchCredentionals(req)
	if err != nil {
		rw.WriteHeader(401)
		io.WriteString(rw, err.Error())
		return uuid.Nil, false
	}

	if apiKey != os.Getenv(apiKeyEnv) {
		rw.WriteHeader(403)
		io.WriteString(rw, "Invalid APIKey")
		return uuid.Nil, false
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

	return userUUID, true
}

func getDBHandler(rw http.ResponseWriter, req *http.Request) {
	userUUID, ok := validateRequestCredentionals(rw, req)
	if !ok {
		return
	}

	path := aws.String(dbPath(userUUID.String()))
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
	rw.WriteHeader(200)
}

func saveDBHandler(rw http.ResponseWriter, req *http.Request) {
	userUUID, ok := validateRequestCredentionals(rw, req)
	if !ok {
		return
	}
	path := aws.String(dbPath(userUUID.String()))

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
