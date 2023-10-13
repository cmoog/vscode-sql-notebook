{ npm2nix, runCommand, nodejs, zip, unzip, sqls }:
npm2nix.v2.build {
  src = runCommand "src-with-sqls" { } ''
    mkdir $out
    cp -r ${./.}/* $out
    cp -r ${sqls}/bin $out/sqls_bin
  '';
  inherit nodejs;
  buildCommands = [ "npm run build" ];
  buildInputs = [ zip unzip ];
  installPhase = ''
    # vsce errors when modtime of zipped files are > present
    new_modtime="0101120000" # MMDDhhmmYY (just needs to be fixed and < present)
    mkdir ./tmp
    unzip -q ./*.vsix -d ./tmp

    for file in $(find ./tmp/ -type f); do
      touch -m "$new_modtime" "$file"
      touch -t "$new_modtime" "$file"
    done

    cd ./tmp
    zip -q -r $out .
  '';
}
