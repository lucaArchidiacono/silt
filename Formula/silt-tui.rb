class SiltTui < Formula
  desc "Local-first, write-only log app — terminal UI"
  homepage "https://github.com/lucaarchidiacono/silt"
  version "0.2.0"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/lucaarchidiacono/silt/releases/download/v0.2.0/silt-macos-arm64.tar.gz"
      sha256 "33d9b700314496d845ae625a9b77a4204d5d904d1725273896f791a5a7324f0c"
    end
  end

  on_linux do
    if Hardware::CPU.intel?
      url "https://github.com/lucaarchidiacono/silt/releases/download/v0.2.0/silt-linux-x64.tar.gz"
      sha256 "a811e8069c4bfb696242ae0b4e74d9af72f4d8a871e7f41123f057904bc8bbb6"
    end
  end

  def install
    bin.install "silt-tui"
  end

  test do
    assert_predicate bin/"silt-tui", :executable?
  end
end
