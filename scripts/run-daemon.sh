#!/bin/bash
# Launches the local-life-os app daemon (used by the LaunchAgent).
export PATH="/Users/arifismailbayrak/.nvm/versions/node/v24.13.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd /Users/arifismailbayrak/local-life-os || exit 1
exec npm start
