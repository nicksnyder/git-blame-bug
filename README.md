# git-blame-bug

This repo reproduces a bug with `git blame --reverse`.
You can reproduce this bug yourself by cloning this repo and running `sh reproduce.sh`.

## Bug description

A regular blame of L465 Tree.tsx at HEAD points to L463 at 199ee7 (expected):
```
$ git blame -p -L465,465 Tree.tsx
199ee75d1240ae72cd965f62aceeb301ab64e1bd 463 465 1
filename Tree.tsx
            public shouldComponentUpdate(nextProps: TileProps): boolean {
```

A reverse blame of L463 at 199ee7 should point to the current HEAD,
but it actually points to L463 at 199ee7:
```
$ git blame -p -L463,463 --reverse 199ee7.. Tree.tsx
199ee75d1240ae72cd965f62aceeb301ab64e1bd 463 463 1
boundary
previous ca0fb5a2d61cb16909bcb06f49dd5448a26f32b1 Tree.tsx
filename Tree.tsx
            public shouldComponentUpdate(nextProps: TileProps): boolean {
```

`git blame --reverse` seems to think that L463 is deleted in ca0fb5,
but `git show ca0fb5` shows the line as unchanged (see declaration of shouldComponentUpdate):
```diff
@@ -452,28 +462,17 @@ export class LayerTile extends React.Component<TileProps, {}> {
         }
     }
 
-    public validTokenRange(props: TileProps): boolean {
-        if (props.selectedPath === '') {
-            return true
-        }
-        const token = props.selectedPath.split('/').pop()!
-        return token >= this.first && token <= this.last
-    }
-
     public shouldComponentUpdate(nextProps: TileProps): boolean {
-        const lastValid = this.validTokenRange(this.props)
-        const nextValid = this.validTokenRange(nextProps)
-        if (!lastValid && !nextValid) {
-            // short circuit
-            return false
+        if (isEqualOrAncestor(this.props.selectedDir, this.props.currSubpath)) {
+            return true
         }
-        if (isEqualOrAncestor(this.props.selectedDir, this.props.currSubpath) && lastValid) {
+        if (nextProps.selectedDir === nextProps.currSubpath) {
             return true
         }
-        if (nextProps.selectedDir === nextProps.currSubpath && this.validTokenRange(nextProps)) {
+        if (getParentDir(nextProps.selectedDir) === nextProps.currSubpath) {
             return true
         }
-        if (getParentDir(nextProps.selectedDir) === nextProps.currSubpath && this.validTokenRange(nextProps)) {
+        if (!isEqual(nextProps.pathSplits, this.props.pathSplits)) {
             return true
         }
         return false
```

## Confirmed reproductions

I believe that there does not exist a git version which handles this case correctly, but I have not done exhaustive testing.

I have confirmed that this behavior is reproducible in the following git versions on macOS High Sierra 10.13.1:
- 2.15.1
- 2.13.6 (Apple Git-96)
- 2.0.0
- 1.7.0
- 1.6.3
- 1.6.2
- 1.6.1

I was unable to compile and test version of git older than 1.6.1.

My colleague has also reproduced this on Ubuntu 17.04.
