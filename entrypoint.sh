#!/bin/sh

chown -R whatever /app/tmp
chown -R whatever /home/whatever/.config
exec runuser -u whatever "$@"