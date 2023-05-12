#!/usr/bin/env bash
for dir in *; do 
  if [ "${dir%node_modules*}" != "$dir" ]; then 
    continue 
  fi
  if [ -f "$dir/package.json" ]; then
    echo "$dir/package.json"
    npm install --prefix $dir
  fi 
done

for dir in */*; do 
  if [ "${dir%node_modules*}" != "$dir" ]; then 
    continue 
  fi
  if [ -f "$dir/package.json" ]; then
    echo "$dir/package.json"
    npm install --prefix $dir
  fi 
done