import { ModelMany2Many } from "@html_builder/core/building_blocks/model_many2many";

export class TagsMany2Many extends ModelMany2Many {
    static props = {
        ...ModelMany2Many.props,
        preview: { type: Function, optional: true },
    };

    setSelection(newSelection) {
        const oldSelection = this.modelEdit.get(this.props.m2oField);
        this.modelEdit.set(this.props.m2oField, newSelection);
        this.env.editor.shared.history.addStep();
        if (this.props.preview) {
            this.props.preview(oldSelection, newSelection);
        }
    }
    async create(name) {
        const [tagId] = await this.env.services.orm.create(this.state.searchModel, [{
            name: name,
        }]);

        this.setSelection([
            ...this.domState.selection,
            {
                id: tagId,
                name: name,
                display_name: name,
                model: this.state.searchModel,
            },
        ]);
    }
}
