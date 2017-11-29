// tslint:disable:no-use-before-declare

import ChevronDownIcon from '@sourcegraph/icons/lib/ChevronDown'
import ChevronRightIcon from '@sourcegraph/icons/lib/ChevronRight'
import * as H from 'history'
import * as immutable from 'immutable'
import { Dictionary, flatten, groupBy, isEqual, partition } from 'lodash'
import * as React from 'react'
import { Link } from 'react-router-dom'
import VisibilitySensor from 'react-visibility-sensor'
import { Subscription } from 'rxjs/Subscription'
import { Repo } from '../repo/index'
import { toBlobURL, toTreeURL } from '../util/url'
import { createTreeStore, TreeStore } from './store'
import { getParentDir, isEqualOrAncestor, scrollIntoView } from './util'

export interface Props extends Repo {
    history: H.History
    paths: string[]
    scrollRootSelector?: string
    selectedPath: string
}

interface State {
    pathSplits: string[][]
}

const treePadding = (depth: number, directory: boolean) => ({
    paddingLeft: depth * 12 + (directory ? 0 : 12) + 12 + 'px',
    paddingRight: '16px',
})

function closeDirectory(store: TreeStore, dir: string): void {
    const state = store.getValue()
    let next = state.shownSubpaths
    for (const path of state.shownSubpaths.toArray().filter(path => isEqualOrAncestor(path, dir))) {
        next = next.remove(path)
    }
    store.setState({ ...state, shownSubpaths: next, selectedPath: dir, selectedDir: dir })
}

export class Tree extends React.Component<Props, State> {
    public store: TreeStore
    private ref: HTMLDivElement | null

    constructor(props: Props) {
        super(props)
        this.state = {
            pathSplits: this.filterPaths(props.paths, props.selectedPath).map(path => path.split('/')),
        }
        this.store = createTreeStore(props.selectedPath)
        this.onKeyDown = this.onKeyDown.bind(this)
    }

    public ArrowDown(): void {
        const loc = this.locateDomNodeInCollection(this.store.getValue().selectedPath)
        if (loc) {
            const { items, i } = loc
            if (i < items.length - 1) {
                // select next
                this.selectElement(items[i + 1])
            } else {
                // select first
                this.selectElement(items[0])
            }
        }
    }

    public ArrowUp(): void {
        const loc = this.locateDomNodeInCollection(this.store.getValue().selectedPath)
        if (loc) {
            const { items, i } = loc
            if (i > 0) {
                // select previous
                this.selectElement(items[i - 1])
            } else {
                // select last
                this.selectElement(items[items.length - 1])
            }
        }
    }

    public ArrowLeft(): void {
        const state = this.store.getValue()
        const selectedPath = state.selectedPath
        const isOpenDir = state.shownSubpaths.contains(selectedPath)
        if (isOpenDir) {
            closeDirectory(this.store, selectedPath)
            return
        }
        const loc = this.locateDomNodeInCollection(selectedPath)
        if (loc) {
            const { items, i } = loc
            const pathSplit = selectedPath.split('/')
            const dir = pathSplit.splice(0, pathSplit.length - 1).join('/')
            const parentDir = dir ? this.locateDomNode(dir) : undefined
            if (parentDir) {
                this.selectElement(parentDir)
                return
            }

            if (i > 0) {
                // select previous
                this.selectElement(items[i - 1])
            } else {
                // select last
                this.selectElement(items[items.length - 1])
            }
        }
    }

    public ArrowRight(): void {
        const state = this.store.getValue()
        const selectedPath = state.selectedPath
        const loc = this.locateDomNodeInCollection(selectedPath)
        if (loc) {
            const { items, i } = loc
            const isDirectory = Boolean(items[i].getAttribute('data-tree-directory'))
            if (!state.shownSubpaths.contains(selectedPath) && isDirectory) {
                // First, show the group (but don't update selection)
                this.store.setState({ ...state, shownSubpaths: state.shownSubpaths.add(selectedPath) })
            } else {
                if (i < items.length - 1) {
                    // select next
                    this.selectElement(items[i + 1])
                } else {
                    // select first
                    this.selectElement(items[0])
                }
            }
        }
    }

    public Enter(): void {
        const state = this.store.getValue()
        const selectedPath = state.selectedPath
        const loc = this.locateDomNodeInCollection(selectedPath)
        if (loc) {
            const { items, i } = loc
            const isDir = Boolean(items[i].getAttribute('data-tree-directory'))
            if (isDir) {
                const isOpen = state.shownSubpaths.contains(selectedPath)
                if (isOpen) {
                    closeDirectory(this.store, selectedPath)
                    return
                }
            }
            this.store.setState({ ...state, shownSubpaths: state.shownSubpaths.add(selectedPath) })
            const urlProps = {
                repoPath: this.props.repoPath,
                rev: this.props.rev,
                filePath: selectedPath,
            }
            this.props.history.push(isDir ? toTreeURL(urlProps) : toBlobURL(urlProps))
        }
    }

    public selectElement(el: HTMLElement): void {
        const root = (this.props.scrollRootSelector
            ? document.querySelector(this.props.scrollRootSelector)
            : document.querySelector('.tree-container')) as HTMLElement
        scrollIntoView(el, root)
        const path = el.getAttribute('data-tree-path')!
        this.store.setState({ ...this.store.getValue(), selectedPath: path, selectedDir: getParentDir(path) })
    }

    public locateDomNode(path: string): HTMLElement | undefined {
        return document.querySelector(`[data-tree-path="${path}"]`) as any
    }

    public locateDomNodeInCollection(path: string): { items: HTMLElement[]; i: number } | undefined {
        const items = document.querySelectorAll('.tree__row-contents') as any
        let i = 0
        for (i; i < items.length; ++i) {
            if (items[i].getAttribute('data-tree-path') === path) {
                return { items, i }
            }
        }
        return undefined
    }

    public onKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
        const handler = (this as any)[event.key]
        if (handler) {
            event.preventDefault()
            handler.call(this, event)
        }
    }

    public componentDidMount(): void {
        if (this.props.selectedPath) {
            setTimeout(() => {
                const el = this.locateDomNode(this.props.selectedPath!)
                if (el) {
                    el.scrollIntoView({ behavior: 'instant' })
                }
            }, 500)
        }
    }

    public componentWillReceiveProps(nextProps: Props): void {
        if (this.props.selectedPath !== nextProps.selectedPath) {
            const selectedPath = nextProps.selectedPath
            let shownSubpaths = this.store.getValue().shownSubpaths
            if (selectedPath) {
                let curr = ''
                const split = selectedPath.split('/')
                for (const part of split) {
                    if (curr !== '') {
                        curr += '/'
                    }
                    curr += part
                    shownSubpaths = shownSubpaths.add(curr)
                }
            }
            this.store.setState({
                ...this.store.getValue(),
                shownSubpaths,
                selectedPath,
                selectedDir: getParentDir(selectedPath),
            })
            setTimeout(() => {
                if (selectedPath) {
                    const el = this.locateDomNode(nextProps.selectedPath!)
                    if (el && !this.elementInViewport(el)) {
                        el.scrollIntoView({ behavior: 'instant' })
                    }
                }
            }, 250)
        }
        if (!isEqual(this.props.paths, nextProps.paths) || this.props.selectedPath !== nextProps.selectedPath) {
            this.setState({
                pathSplits: this.filterPaths(nextProps.paths, nextProps.selectedPath).map(path => path.split('/')),
            })
        }
    }

    public elementInViewport(el: any): boolean {
        const rect = el.getBoundingClientRect()
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) /*or $(window).height() */ &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth) /*or $(window).width() */
        )
    }

    public render(): JSX.Element | null {
        return (
            <div ref={this.focusOnMount} className="tree" tabIndex={1} onKeyDown={this.onKeyDown}>
                <TreeLayer
                    history={this.props.history}
                    repoPath={this.props.repoPath}
                    rev={this.props.rev}
                    pathSplits={this.state.pathSplits}
                    store={this.store}
                    currSubpath=""
                />
            </div>
        )
    }

    private focusOnMount = (ref: HTMLDivElement | null) => {
        if (this.ref === undefined && ref) {
            this.ref = ref
            ref.focus()
        }
    }

    /**
     * Filters the paths down to just ones that are below the selected paths
     * directory.
     */
    private filterPaths = (paths: string[], selectedPath: string): string[] => {
        // We assume the selected path is a directory if there are any paths
        // nested below it, i.e. if it contains files.
        //
        // TODO(slimsag): future: this won't work for empty directories.
        let selectedPathIsDir = false
        for (const path of paths) {
            if (path !== selectedPath && path.startsWith(selectedPath)) {
                selectedPathIsDir = true
                break
            }
        }

        // Determine the directory under which we will show files. If
        // selectedPath is a file, this is the parent directory. Otherwise,
        // it is itself the directory under which we show files.
        const selectedDir = selectedPathIsDir ? selectedPath : getParentDir(selectedPath)

        // Filter down the paths to just the ones that we will show.
        return paths.filter(path => selectedDir.startsWith(path) || path.startsWith(selectedDir))
    }
}

interface TreeLayerProps extends Repo {
    history: H.History
    pathSplits: string[][] // assume only given paths nested at (or below) the current layer
    currSubpath: string
    store: TreeStore
}

interface TreeLayerState {
    shownSubpaths: immutable.Set<string>
    selectedPath: string
    selectedDir: string
}

export class TreeLayer extends React.Component<TreeLayerProps, TreeLayerState> {
    public subscription: Subscription
    public files: string[][] // array of path parts
    public subfiles: string[][] // array of path parts
    public subfilesByDir: Dictionary<string[][]> // array of path parts
    public depth: number

    constructor(props: TreeLayerProps) {
        super(props)
        this.setup(props)
        this.state = { ...props.store.getValue() }
    }

    public setup(props: TreeLayerProps): void {
        this.depth = this.getDepth(props)
        const [files, subfiles] = partition(props.pathSplits, split => split.length === this.depth + 1)
        this.files = files
        this.subfiles = subfiles
        this.subfilesByDir = groupBy(subfiles, subfile => subfile[this.depth])
    }

    public shouldComponentUpdate(nextProps: TreeLayerProps, nextState: TreeLayerState): boolean {
        const isParentOfSelection = getParentDir(nextState.selectedPath) === nextProps.currSubpath
        if (isParentOfSelection) {
            return true
        }
        if (isEqualOrAncestor(this.state.selectedDir, this.props.currSubpath)) {
            // was previously in the layer
            return true
        }
        if (nextState.selectedDir === nextProps.currSubpath) {
            // is selecting in curr directory
            return true
        }
        if (!isEqual(nextProps.pathSplits, this.props.pathSplits)) {
            return true
        }

        return false
    }

    public componentWillReceiveProps(props: TreeLayerProps): void {
        this.setup(props)
    }

    public componentWillUnmount(): void {
        if (this.subscription) {
            this.subscription.unsubscribe()
        }
    }

    public onChangeVisibility = (isVisible: boolean): void => {
        if (this.subscription) {
            this.subscription.unsubscribe()
        }
        if (isVisible) {
            this.subscription = this.props.store.subscribe(state => {
                this.setState({ ...this.state, ...state })
            })
        }
    }

    public getDepth(props: TreeLayerProps): number {
        return props.currSubpath === '' ? 0 : props.currSubpath.split('/').length
    }

    public tile<T>(arr: T[]): T[][] {
        const res: T[][] = []
        let i = 0
        while (i < arr.length) {
            const next = arr.slice(i, i + 10)
            i += next.length
            res.push(next)
        }
        return res
    }

    public render(): JSX.Element | null {
        return (
            <VisibilitySensor onChange={this.onChangeVisibility} partialVisibility={true}>
                <table style={{ width: '100%' }}>
                    <tbody>
                        <tr>
                            <td>
                                {this.tile(Object.keys(this.subfilesByDir)).map((dirs, i) => {
                                    const subfilesByDir: _.Dictionary<string[][]> = {}
                                    let subfiles: string[][] = []
                                    for (const dir of dirs) {
                                        subfiles = subfiles.concat(this.subfilesByDir[dir])
                                        subfilesByDir[dir] = this.subfilesByDir[dir]
                                    }
                                    return (
                                        <LayerTile
                                            key={i}
                                            {...this.props}
                                            {...this.state}
                                            depth={this.depth}
                                            files={[]}
                                            subfiles={subfiles}
                                            subfilesByDir={subfilesByDir}
                                        />
                                    )
                                })}
                            </td>
                        </tr>
                        <tr>
                            <td>
                                {this.tile(this.files).map((files, i) => (
                                    <LayerTile
                                        key={i}
                                        {...this.props}
                                        {...this.state}
                                        depth={this.depth}
                                        files={files}
                                        subfiles={[]}
                                        subfilesByDir={{}}
                                    />
                                ))}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </VisibilitySensor>
        )
    }
}

interface TileProps extends TreeLayerProps, TreeLayerState {
    files: string[][] // array of path parts
    subfiles: string[][] // array of path parts
    subfilesByDir: _.Dictionary<string[][]> // array of path parts
    depth: number
}

export class LayerTile extends React.Component<TileProps, {}> {
    public first: string
    public last: string

    constructor(props: TileProps) {
        super(props)
        const dirs = Object.keys(props.subfilesByDir)
        if (dirs.length > 0) {
            this.first = dirs[0]
            this.last = dirs[dirs.length - 1]
        }
        if (props.files.length > 0) {
            if (!this.first) {
                const firstFile = props.files[0]
                this.first = firstFile[firstFile.length - 1] // pluck the last path component
            }
            const lastFile = props.files[props.files.length - 1]
            this.last = lastFile[lastFile.length - 1] // pluck the last path component
        }
    }

    public shouldComponentUpdate(nextProps: TileProps): boolean {
        if (isEqualOrAncestor(this.props.selectedDir, this.props.currSubpath)) {
            return true
        }
        if (nextProps.selectedDir === nextProps.currSubpath) {
            return true
        }
        if (getParentDir(nextProps.selectedDir) === nextProps.currSubpath) {
            return true
        }
        if (!isEqual(nextProps.pathSplits, this.props.pathSplits)) {
            return true
        }
        return false
    }

    public getDepth(props: TreeLayerProps): number {
        return props.currSubpath === '' ? 0 : props.currSubpath.split('/').length
    }

    public showSubpath(dir: string): boolean {
        const prefix = this.currentDirectory(dir)
        for (const subpathToShow of this.props.shownSubpaths.toArray()) {
            if (subpathToShow === this.props.currSubpath) {
                // Don't need to show subpath in the directory we're already in
                continue
            }
            if (isEqualOrAncestor(subpathToShow, prefix)) {
                return true
            }
        }
        return false
    }

    public currentDirectory(dir: string): string {
        return this.props.currSubpath ? this.props.currSubpath + '/' + dir : dir
    }

    public render(): JSX.Element | null {
        return (
            <table className="tile" style={{ width: '100%' }}>
                <tbody>
                    {flatten(
                        Object.keys(this.props.subfilesByDir).map((dir, i) => [
                            <tr
                                key={i}
                                className={[
                                    'tree__row',
                                    this.props.shownSubpaths.contains(this.currentDirectory(dir)) &&
                                        'tree__row--expanded',
                                    this.currentDirectory(dir) === this.props.selectedPath && 'tree__row--selected',
                                ]
                                    .filter(c => !!c)
                                    .join(' ')}
                            >
                                <td
                                    // tslint:disable-next-line:jsx-no-lambda
                                    onClick={() => {
                                        const state = this.props.store.getValue()
                                        const path = this.currentDirectory(dir)
                                        const isShown = state.shownSubpaths.contains(path)
                                        if (isShown) {
                                            closeDirectory(this.props.store, path)
                                        } else {
                                            this.props.store.setState({
                                                ...state,
                                                shownSubpaths: state.shownSubpaths.add(path),
                                                selectedPath: path,
                                                selectedDir: path,
                                            })
                                        }
                                    }}
                                >
                                    <div
                                        className="tree__row-contents"
                                        data-tree-directory="true"
                                        data-tree-path={this.currentDirectory(dir)}
                                        style={treePadding(this.props.depth, true)}
                                    >
                                        <a
                                            className="tree__row-icon"
                                            href={toTreeURL({
                                                repoPath: this.props.repoPath,
                                                rev: this.props.rev,
                                                filePath: this.currentDirectory(dir),
                                            })}
                                            onClick={this.noopRowClick}
                                        >
                                            {this.props.shownSubpaths.contains(this.currentDirectory(dir)) ? (
                                                <ChevronDownIcon className="icon-inline" />
                                            ) : (
                                                <ChevronRightIcon className="icon-inline" />
                                            )}
                                        </a>
                                        <a
                                            href={toTreeURL({
                                                repoPath: this.props.repoPath,
                                                rev: this.props.rev,
                                                filePath: this.currentDirectory(dir),
                                            })}
                                            onClick={this.noopRowClick}
                                            className="tree__row-label"
                                        >
                                            {dir}
                                        </a>
                                    </div>
                                </td>
                            </tr>,
                            this.showSubpath(dir) && (
                                <tr key={'layer-' + i}>
                                    <td>
                                        <TreeLayer
                                            key={'layer-' + i}
                                            history={this.props.history}
                                            repoPath={this.props.repoPath}
                                            rev={this.props.rev}
                                            store={this.props.store}
                                            pathSplits={this.props.pathSplits.filter(
                                                split => split[this.props.depth] === dir
                                            )}
                                            currSubpath={this.currentDirectory(dir)}
                                        />
                                    </td>
                                </tr>
                            ),
                        ])
                    )}
                    {this.props.files.map((file, i) => {
                        const path = file.join('/')
                        return (
                            <tr
                                key={i}
                                className={path === this.props.selectedPath ? 'tree__row--selected' : 'tree__row'}
                            >
                                <td style={treePadding(this.props.depth, false)}>
                                    <Link
                                        className="tree__row-contents"
                                        to={toBlobURL({
                                            repoPath: this.props.repoPath,
                                            rev: this.props.rev,
                                            filePath: path,
                                        })}
                                        data-tree-path={path}
                                    >
                                        {file[file.length - 1]}
                                    </Link>
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        )
    }

    /**
     * noopRowClick is the click handler for <a> rows of the tree element
     * that shouldn't update URL on click w/o modifier key (but should retain
     * anchor element properties, like right click "Copy link address").
     */
    private noopRowClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
        if (!e.altKey && !e.metaKey && !e.shiftKey && !e.ctrlKey) {
            e.preventDefault()
        }
    }
}
