{
  description = "epochcloud-demo - SvelteKit reference app for the epochcloud platform";
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    bun-aarch64-darwin = { url = "file+https://github.com/oven-sh/bun/releases/download/bun-v1.4.4/bun-darwin-aarch64.zip"; flake = false; };
    bun-x86_64-darwin = { url = "file+https://github.com/oven-sh/bun/releases/download/bun-v1.4.4/bun-darwin-x64-baseline.zip"; flake = false; };
    bun-aarch64-linux = { url = "file+https://github.com/oven-sh/bun/releases/download/bun-v1.4.4/bun-linux-aarch64.zip"; flake = false; };
    bun-x86_64-linux = { url = "file+https://github.com/oven-sh/bun/releases/download/bun-v1.4.4/bun-linux-x64-baseline.zip"; flake = false; };
    node-aarch64-darwin = { url = "file+https://nodejs.org/dist/v24.22.1/node-v24.22.1-darwin-arm64.tar.xz"; flake = false; };
    node-x86_64-darwin = { url = "file+https://nodejs.org/dist/v24.22.1/node-v24.22.1-darwin-x64.tar.xz"; flake = false; };
    node-aarch64-linux = { url = "file+https://nodejs.org/dist/v24.22.1/node-v24.22.1-linux-arm64.tar.xz"; flake = false; };
    node-x86_64-linux = { url = "file+https://nodejs.org/dist/v24.22.1/node-v24.22.1-linux-x64.tar.xz"; flake = false; };
  };
  outputs = inputs@{ self, nixpkgs, flake-utils, ... }:
    let
      manifest = builtins.fromJSON (builtins.readFile ./package.json);
      lock = builtins.fromJSON (builtins.readFile ./flake.lock);
      bunVersion = builtins.elemAt (builtins.match "bun@(.+)" manifest.packageManager) 0;
      nodeVersion = manifest.engines.node;
      bunArchives = {
        aarch64-darwin = "bun-darwin-aarch64";
        x86_64-darwin = "bun-darwin-x64-baseline";
        aarch64-linux = "bun-linux-aarch64";
        x86_64-linux = "bun-linux-x64-baseline";
      };
      nodePlatforms = {
        aarch64-darwin = "darwin-arm64";
        x86_64-darwin = "darwin-x64";
        aarch64-linux = "linux-arm64";
        x86_64-linux = "linux-x64";
      };
      systems = builtins.attrNames bunArchives;
      expectedURLs = builtins.listToAttrs (
        (map (system: { name = "bun-${system}"; value = "https://github.com/oven-sh/bun/releases/download/bun-v${bunVersion}/${bunArchives.${system}}.zip"; }) systems) ++
        (map (system: { name = "node-${system}"; value = "https://nodejs.org/dist/v${nodeVersion}/node-v${nodeVersion}-${nodePlatforms.${system}}.tar.xz"; }) systems)
      );
      lockedURL = name: lock.nodes.${lock.nodes.root.inputs.${name}}.locked.url;
      runtimeInputsMatch = builtins.all (name: lockedURL name == expectedURLs.${name}) (builtins.attrNames expectedURLs);
    in
    assert manifest.engines.bun == bunVersion;
    assert runtimeInputsMatch;
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        bunSource = bunArchives.${system};
        bun = pkgs.bun.overrideAttrs (_: {
          version = bunVersion;
          src = builtins.path {
            path = inputs.${"bun-${system}"}.outPath;
            name = "${bunSource}.zip";
          };
          sourceRoot = bunSource;
          doInstallCheck = true;
          installCheckPhase = ''
            test "$($out/bin/bun --version)" = "${bunVersion}"
          '';
        });
        # The official artifact keeps the complete upstream crypto bundle.
        node = pkgs.stdenvNoCC.mkDerivation {
          pname = "nodejs";
          version = nodeVersion;
          src = builtins.path {
            path = inputs.${"node-${system}"}.outPath;
            name = "node-v${nodeVersion}-${nodePlatforms.${system}}.tar.xz";
          };
          nativeBuildInputs = pkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux [ pkgs.autoPatchelfHook ];
          buildInputs = pkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux [ pkgs.stdenv.cc.cc.lib ];
          dontBuild = true;
          dontConfigure = true;
          dontStrip = true;
          installPhase = "install -Dm755 bin/node $out/bin/node";
          doInstallCheck = true;
          installCheckPhase = ''
            test "$($out/bin/node --version)" = "v${nodeVersion}"
          '';
        };
      in {
        devShells.default = pkgs.mkShell {
          packages = [ bun node ] ++ (with pkgs; [ podman qemu git jq curl ]);
          shellHook = ''
            export PATH="$PWD/bin:$PWD/node_modules/.bin:$PATH"
            bun install --frozen-lockfile || exit 1
            echo "epochcloud-demo: Bun $(bun --version); Node $(node --version) for tooling" >&2
            echo "Local: bun run dev, bun run check, bun run test, bun run build" >&2
            echo "Publish with deploy only after starting the existing Podman machine separately." >&2
          '';
        };
      }) // {
        runtimeConsistency = "Bun ${bunVersion} and Node ${nodeVersion} match all locked runtime archives\n";
      };
}
