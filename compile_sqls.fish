#!/usr/bin/env fish

# This script compiles the ./sqls language server
# into binaries for the most common ARCH/OS combinations.
# Then, we use `upx` to compress the binary to save on
# overall bundle size.
# 
# Eventually, these binaries are bundled into the final
# .vsix asset and shipped with the extension. At runtime,
# the extension will check if an available binary exists for
# the given detected ARCH/OS combo. If yes, it will run it as
# a language server to provide enhanced completion support. 


set --local arch { arm64, amd64, 386 }
set --local os { linux, darwin, windows }

cd sqls

for a in $arch
	for o in $os
		if [ "$o" = "darwin" -a "$a" = "386" ]
			continue
		end
		echo "building sqls_"$a"_"$o
		set --local binpath "../sqls_bin/sqls_"$a"_"$o
		CGO_ENABLED=0 GOOS=$o GOARCH=$a go build -o $binpath -ldflags="-s -w"; or exit 1
		# upx $binpath # fine if this fails
	end
end
