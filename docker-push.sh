#!/bin/sh

branch="$(git branch --show-current)"
commit="$(git log -1 --format=%h)"
echo $branch-$commit
myusername=${DOCKERHUB_USER}
mypassword=${DOCKERHUB_PASS}
echo $myusername
echo $mypassword
docker build -t tgplay .
docker tag tgplay $myusername/tgplay:$branch-$commit
docker login -u $myusername -p $mypassword docker.io
docker push $DOCKERHUB_USER/tgplay:$branch-$commit
