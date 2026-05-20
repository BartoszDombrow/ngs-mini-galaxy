#!/usr/bin/env bash

set -euo pipefail

OS="$(uname -s)"

install_macos() {
  if ! command -v brew >/dev/null 2>&1; then
    echo "Homebrew is required on macOS: https://brew.sh"
    exit 1
  fi

  brew update
  brew install fastqc bwa samtools bcftools sratoolkit openjdk python

  if command -v pipx >/dev/null 2>&1; then
    pipx install multiqc || pipx upgrade multiqc
  else
    python3 -m pip install --user multiqc
  fi
}

install_linux() {
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update
    sudo apt-get install -y fastqc bwa samtools bcftools default-jre python3-pip
    if command -v pipx >/dev/null 2>&1; then
      pipx install multiqc || pipx upgrade multiqc
    else
      python3 -m pip install --user multiqc
    fi
    if ! command -v fastq-dump >/dev/null 2>&1 && ! command -v fasterq-dump >/dev/null 2>&1; then
      echo "Install SRA Toolkit manually from https://github.com/ncbi/sra-tools/wiki/Downloads"
    fi
    return
  fi

  echo "Unsupported Linux package manager. Install manually:"
  echo "  fastqc, multiqc, bwa, samtools, bcftools, sra-tools, java"
  exit 1
}

case "$OS" in
  Darwin)
    install_macos
    ;;
  Linux)
    install_linux
    ;;
  *)
    echo "Unsupported OS: $OS"
    exit 1
    ;;
esac

echo
echo "Installed core bioinformatics tools."
echo "Verify from the app with GET /system/tools or from shell:"
echo "  fastqc --version"
echo "  multiqc --version"
echo "  fasterq-dump --version"
echo "  bwa"
echo "  samtools --version"
echo "  bcftools --version"
