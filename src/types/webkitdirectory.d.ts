import "react";

// `webkitdirectory` turns a file <input> into a folder picker. It's a
// well-supported non-standard attribute that React's DOM typings don't
// include, so we augment InputHTMLAttributes to allow it type-safely.
declare module "react" {
  interface InputHTMLAttributes<T> {
    webkitdirectory?: string;
  }
}
