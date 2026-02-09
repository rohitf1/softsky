#!/bin/sh
set -eu

: "${SOFTSKY_API_ORIGIN:=https://softsky-api-mxuh5zd5za-uc.a.run.app}"

envsubst '${SOFTSKY_API_ORIGIN}' < /etc/nginx/templates/web.conf.template > /etc/nginx/conf.d/default.conf
