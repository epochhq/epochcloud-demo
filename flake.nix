{
  description = "epochcloud-demo - SvelteKit reference app for the epochcloud platform";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # SvelteKit local toolchain for `pnpm dev` / `pnpm build` (local only).
            nodejs_latest
            pnpm

            # `deploy` is a thin wrapper: it runs the published ci-tools-build
            # image under host podman and only needs git/jq/curl itself. podman
            # is a host prerequisite (it drives a Linux VM via `podman machine`),
            # so it is intentionally not pinned in the devShell.
            git
            jq
            curl
          ];

          shellHook = ''
            # Put the repo's bin/ first so `deploy` resolves as a bare command,
            # then node_modules/.bin for vite/svelte-check/etc.
            export PATH="$PWD/bin:$PWD/node_modules/.bin:$PATH"

            if [ ! -d "$PWD/node_modules" ]; then
              echo "Installing dependencies (pnpm install)..."
              pnpm install --frozen-lockfile 2>/dev/null || pnpm install
            fi

            {
              echo ""
              echo "epochcloud-demo dev environment"
              echo "───────────────────────────────"
              echo "Node: $(node --version)"
              echo "pnpm: $(pnpm --version)"
              echo ""
              echo "Ship an image:"
              echo "  deploy       - Build + keyless-sign + push the dev image; the dev Kargo Warehouse auto-promotes it to the dev Stage (the only command that deploys)"
              echo ""
              echo "Local only (never deploy):"
              echo "  pnpm dev     - SvelteKit dev server (vite dev)"
              echo "  pnpm build   - production build (vite build)"
              echo ""
            } >&2
          '';
        };
      });
}
