class SiltTui < Formula
  desc "Local-first, write-only log app — terminal UI"
  homepage "https://github.com/lucaarchidiacono/silt"
  version "0.1.0"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/lucaarchidiacono/silt/releases/download/v0.1.0/silt-macos-arm64.tar.gz"
      sha256 "PLACEHOLDER"
    else
      url "https://github.com/lucaarchidiacono/silt/releases/download/v0.1.0/silt-macos-x64.tar.gz"
      sha256 "PLACEHOLDER"
    end
  end

  on_linux do
    if Hardware::CPU.intel?
      url "https://github.com/lucaarchidiacono/silt/releases/download/v0.1.0/silt-linux-x64.tar.gz"
      sha256 "PLACEHOLDER"
    end
  end

  def install
    bin.install "silt-tui"
  end

  test do
    assert_predicate bin/"silt-tui", :executable?
  end
end
