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

            # `deploy` runs `ci-tools build-local` inside the published ci-tools
            # image via podman; the podman machine (the Linux build VM on macOS) is
            # auto-provisioned by the shellHook below. qemu backs the cross-arch
            # (linux/amd64 on arm64) build. git/jq/curl are what `deploy` uses.
            podman
            qemu
            git
            jq
            curl
          ];

          shellHook = ''
            # Put the repo's bin/ first so `deploy` resolves as a bare command,
            # then node_modules/.bin for vite/svelte-check/etc.
            export PATH="$PWD/bin:$PWD/node_modules/.bin:$PATH"

            # Auto-provision the podman build VM (the Linux VM buildah uses for the
            # cross-arch linux/amd64-on-arm64 build; docker cannot drive that flow).
            # Self-contained: a fresh direnv yields a ready runtime, no manual
            # `podman machine init`. init is one-time (a few minutes; the default
            # 2 GiB RAM is too small for a cross-arch buildah, so size it up); the
            # start check is a fast no-op once the VM is running.
            if ! podman machine inspect >/dev/null 2>&1; then
              echo "Provisioning the podman build VM (one-time, a few minutes)..." >&2
              podman machine init --memory 8192 >&2
            fi
            if ! podman machine inspect --format '{{.State}}' 2>/dev/null | grep -q running; then
              echo "Starting the podman build VM..." >&2
              podman machine start >&2
            fi

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
