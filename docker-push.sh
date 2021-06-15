#!/bin/sh

branch="$(git branch --show-current)"
commit="$(git log -1 --format=%h)"
echo $branch-$commit
myusername="${DOCKERHUB_USER}:-default_value}"
mypassword="${DOCKERHUB_PASS}:-default_value}"
docker build -t tgplay .
docker tag tgplay $DOCKERHUB_USER/tgplay:$branch-$commit
docker login -u $myusername -p $mypassword docker.io
docker push $DOCKERHUB_USER/tgplay:$branch-$commit
