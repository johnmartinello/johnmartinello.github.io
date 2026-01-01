# Setup and Running Instructions

This is a Jekyll site that requires Ruby and Bundler to run.

## Prerequisites

1. **Install Ruby** (if not already installed)
   - Download from: https://rubyinstaller.org/
   - Choose the Ruby+Devkit version (recommended for Windows)
   - During installation, check "Add Ruby executables to your PATH"

2. **Verify Ruby installation**
   ```powershell
   ruby --version
   ```

## Installation Steps

1. **Install Bundler** (Ruby gem manager)
   ```powershell
   gem install bundler
   ```

2. **Install Jekyll dependencies**
   ```powershell
   bundle install
   ```
   This will install all dependencies listed in `Gemfile`, including:
   - `github-pages` (includes Jekyll)
   - `jekyll-feed`
   - Windows-specific gems (`tzinfo-data`, `wdm`)

## Running the Site

1. **Start the Jekyll development server**
   ```powershell
   bundle exec jekyll serve
   ```

2. **Access the site**
   - Open your browser and go to: `http://localhost:4000`
   - The site will auto-reload when you make changes to files

## Additional Commands

- **Build the site** (without serving):
  ```powershell
  bundle exec jekyll build
  ```
  Or use the npm script:
  ```powershell
  npm run build
  ```

- **Serve with live reload** (default behavior):
  ```powershell
  bundle exec jekyll serve --livereload
  ```

- **Serve on a different port**:
  ```powershell
  bundle exec jekyll serve --port 4001
  ```


