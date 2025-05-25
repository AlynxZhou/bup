#!/bin/bash

npx bup && git add --all && git commit --message "Updated." && git push --set-upstream origin master

exit 0
