import { createApp, h, reactive } from 'vue';
import { UiSelect } from '@yaochn/als-office-editor-ui/vue';
import '@yaochn/als-office-editor-ui/vue/styles.css';

/** Reuses the same menu, focus handling and selection component as the apps. */
class CubeSelect extends HTMLElement {
 private state = reactive({value:'', options:[] as {value:string;label:string}[]});
 private app?: ReturnType<typeof createApp>;
 get value() { return this.state.value; }
 set value(value:string) { this.state.value=value; }
 get options() { return this.state.options; }
 set options(value:{value:string;label:string}[]) { this.state.options=value; }
 connectedCallback() {
  if (this.app) return;
  // Preserve assignments made before the custom element bundle finished loading.
  for (const key of ['value','options'] as const) {
   if (Object.prototype.hasOwnProperty.call(this,key)) {
    const value=this[key]; delete (this as any)[key]; (this as any)[key]=value;
   }
  }
  if (this.hasAttribute('options')) this.options=JSON.parse(this.getAttribute('options')!);
  if (this.hasAttribute('value')) this.value=this.getAttribute('value')!;
  this.app=createApp({render:()=>h(UiSelect,{modelValue:this.state.value,options:this.state.options,ariaLabel:this.getAttribute('aria-label') || '筛选', 'onUpdate:modelValue':(value:string)=>{this.value=value;this.dispatchEvent(new Event('change',{bubbles:true}));}})});
  this.app.mount(this);
 }
 disconnectedCallback() { this.app?.unmount();this.app=undefined; }
}
customElements.define('cube-select',CubeSelect);
