import {
	useCallback,
	forwardRef,
	useImperativeHandle,
	useEffect,
	useState,
} from "react";
import {
	useRemirror,
	EditorComponent,
	Remirror,
	ReactFrameworkOutput,
} from "@remirror/react";
import type { RemirrorJSON } from "remirror";
import { EntityReferenceExtension } from "remirror/extensions";
import type {
	RemirrorEventListener,
	RemirrorEventListenerProps,
} from "@remirror/core";
import type { Node, Mark } from "@remirror/pm/model";
import { highlightMap } from "../utils/highlightMap";
import { HighlightButtons } from "./HighlightButtons";
import { decorateHighlights } from "../utils/decorateHighlights";

type EditorProps = {
	initialContent?: RemirrorJSON;
	placeholder?: string;
	onChange?: RemirrorEventListener<EntityReferenceExtension>;
	onChangeJSON?: (json: RemirrorJSON) => void;
};

const Editor = forwardRef<
	ReactFrameworkOutput<EntityReferenceExtension>,
	EditorProps
>((props: EditorProps, ref) => {
	const [isInitialized, setIsInitialized] = useState(false);
	const { onChange, onChangeJSON } = props;
	const { manager, state, setState, getContext } = useRemirror({
		extensions: () => [
			new EntityReferenceExtension({
				getStyle: decorateHighlights,
			}),
		],
		content: props.initialContent ?? {
			type: "doc",
			content: [{ type: "paragraph" }],
		},
		stringHandler: "html",
	});

	useImperativeHandle(
		ref,
		() => getContext() as ReactFrameworkOutput<EntityReferenceExtension>,
		[getContext]
	);

	useEffect(() => {
		if (!isInitialized && props.initialContent) {
			setState(
				manager.createState({
					content: props.initialContent,
					stringHandler: "html",
				})
			);
			setIsInitialized(true);
		}
	}, [isInitialized, props.initialContent, manager, setState]);

	const handleChange: RemirrorEventListener<EntityReferenceExtension> =
		useCallback(
			(parameter: RemirrorEventListenerProps<EntityReferenceExtension>) => {
				setState(parameter.state);
				onChange?.(parameter);

				parameter.state.doc.descendants((node: Node) => {
					if (node.marks) {
						node.marks.forEach((mark: Mark) => {
							if (
								mark.type.name === "entity-reference" &&
								mark.attrs.id &&
								mark.attrs.labelType
							) {
								highlightMap.set(mark.attrs.id, mark.attrs.labelType);
							}
						});
					}
					return true;
				});

				const json = parameter.state.doc.toJSON();
				if (json.content?.[0]?.content?.length > 0 || isInitialized) {
					onChangeJSON?.(json);
				}
			},
			[setState, onChange, onChangeJSON, isInitialized]
		);

	return (
		<Remirror
			manager={manager}
			state={state}
			onChange={handleChange}
			placeholder={props.placeholder || "Enter text..."}
		>
			<EditorComponent />
			<div className="border-t border-gray-200 p-4">
				<HighlightButtons onSave={onChangeJSON!} />
			</div>
		</Remirror>
	);
});

Editor.displayName = "Editor";

export default Editor;
