cd $(dirname $0)
forge build
forge inspect Refuje bytecode >/dev/null
forge bind -b ./src/bindings --overwrite --alloy-version 2 --select 'Refuje' --single-file --module