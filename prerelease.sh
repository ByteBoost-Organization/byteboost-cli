#! bash

set -e

branchName=$(eval "git rev-parse --abbrev-ref HEAD")

npm run copy-dev-conf
npm run clean
npx tsc

git add .

git commit -am "not important"

git push

npm version prerelease --preid=$branchName

npm publish

git push

packageVersion=$(eval "node -e \"console.log(require('./package.json').version);\"")

echo ""

echo "To install package run: "
echo "npm install @byteboost/cli@$packageVersion --save-exact"
echo "Or"
echo "node update-package-all-services.js @byteboost/cli@$packageVersion"