#!/bin/sh

chown -R whatever /home/whatever/.config
exec runuser -u whatever "$@"