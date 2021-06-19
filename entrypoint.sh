#!/bin/sh

chown -R whatever /app
chown -R whatever /home/whatever
exec runuser -u whatever "$@"