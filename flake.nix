{
  description = "VS Code extension for opening SQL files as interactive notebooks.";
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    npmlock2nix = {
      url = "github:nix-community/npmlock2nix";
      flake = false;
    };
  };

  outputs = { self, nixpkgs, npmlock2nix, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        npm2nix = import npmlock2nix { inherit pkgs; };
        buildSqls = { arch, os }: with pkgs; (buildGoModule {
          name = "sqls_${arch}_${os}";
          src = fetchFromGitHub {
            owner = "cmoog";
            repo = "sqls";
            rev = "8f600074d1b0778c7a0b6b9b820dd4d2d05fbdee";
            sha256 = "sha256-3nYWMDKqmQ0NnflX/4vx1BA+rubWV7pRdZcDaKUatO0=";
          };
          doCheck = false;
          vendorHash = "sha256-Xv/LtjwgxydMwychQtW1+quqUbkC5PVzhga5qT5lI3s=";
          CGO_ENABLED = 0;
        }).overrideAttrs (old: old // { GOOS = os; GOARCH = arch; });
        # build each os/arch combination
        sqlsInstallCommands = builtins.concatStringsSep "\n" (pkgs.lib.flatten (map
          (os: (map
            (arch:
              # skip this invalid os/arch combination
              if arch == "386" && os == "darwin" then "" else
              "cp $(find ${buildSqls { inherit os arch; }} -type f) $out/bin/sqls_${arch}_${os}"
            ) [ "amd64" "arm64" "386" ])) [ "linux" "darwin" "windows" ]));
        sqls = pkgs.runCommand "multiarch-sqls" { } ''
          mkdir -p $out/bin
          ${sqlsInstallCommands}
        '';
      in
      {
        formatter = pkgs.nixpkgs-fmt;
        packages = {
          inherit sqls;
          default = pkgs.callPackage ./. { inherit sqls npm2nix; };
        };
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            fish
            go
            nodejs
            typos
            upx
          ];
        };
      }
    );
}
