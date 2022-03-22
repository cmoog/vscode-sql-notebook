#!/usr/bin/env fish

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
		upx $binpath # fine if this fails
	end
end
