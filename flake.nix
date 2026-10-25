{
  description = "BoxBox — per-tab session isolation extension: dev environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs {
        inherit system;
        config.allowUnfreePredicate = p:
          builtins.elem (nixpkgs.lib.getName p) [ "google-chrome" ];
      };

      heliumVersion = "0.19.4.1";
      heliumSrc = pkgs.fetchurl {
        url = "https://github.com/imputnet/helium-linux/releases/download/${heliumVersion}/helium-${heliumVersion}-x86_64_linux.tar.xz";
        hash = "sha256-bKbkoA/vWRaCH7GvipYHzGs4b2eKfrQi5V8ZEWujBGk=";
      };

      # Helium is a prebuilt Chromium; run it in an FHS env.
      heliumUnwrapped = pkgs.stdenvNoCC.mkDerivation {
        pname = "helium-unwrapped";
        version = heliumVersion;
        src = heliumSrc;
        sourceRoot = ".";
        unpackPhase = "tar xf $src";
        installPhase = ''
          mkdir -p $out
          cp -r helium-${heliumVersion}-x86_64_linux $out/
        '';
        dontFixup = true;
      };

      helium = pkgs.buildFHSEnv {
        name = "helium";
        targetPkgs = p: with p; [
          alsa-lib at-spi2-atk at-spi2-core atk cairo cups dbus expat fontconfig
          freetype gdk-pixbuf glib gtk3 libdrm libgbm libglvnd libxkbcommon
          nspr nss pango libpulseaudio systemd vulkan-loader wayland zlib
          xorg.libX11 xorg.libXcomposite xorg.libXcursor xorg.libXdamage
          xorg.libXext xorg.libXfixes xorg.libXi xorg.libXrandr xorg.libXrender
          xorg.libXtst xorg.libxcb xorg.libXScrnSaver libxshmfence
          liberation_ttf
        ];
        runScript = pkgs.writeShellScript "helium-run" ''
          exec ${heliumUnwrapped}/helium-${heliumVersion}-x86_64_linux/helium "$@"
        '';
      };
    in {
      packages.${system} = { inherit helium heliumUnwrapped; };

      devShells.${system}.default = pkgs.mkShell {
        packages = [
          pkgs.nodejs pkgs.firefox pkgs.google-chrome
          pkgs.geckodriver pkgs.chromedriver pkgs.zip pkgs.openssl pkgs.jq
          helium
        ];
        shellHook = ''
          export BOX_FIREFOX=${pkgs.firefox}/bin/firefox
          export BOX_CHROME=${pkgs.google-chrome}/bin/google-chrome-stable
          export BOX_HELIUM=${helium}/bin/helium
          export BOX_GECKODRIVER=${pkgs.geckodriver}/bin/geckodriver
          export BOX_CHROMEDRIVER=${pkgs.chromedriver}/bin/chromedriver
        '';
      };
    };
}
