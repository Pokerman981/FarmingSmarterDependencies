/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { __assign } from "tslib";
import { getCompilerFacade } from '../../compiler/compiler_facade';
import { resolveForwardRef } from '../../di/forward_ref';
import { getReflect, reflectDependencies } from '../../di/jit/util';
import { componentNeedsResolution, maybeQueueResolutionOfComponentResources } from '../../metadata/resource_loading';
import { ViewEncapsulation } from '../../metadata/view';
import { initNgDevMode } from '../../util/ng_dev_mode';
import { getComponentDef, getDirectiveDef } from '../definition';
import { EMPTY_ARRAY, EMPTY_OBJ } from '../empty';
import { NG_COMP_DEF, NG_DIR_DEF, NG_FACTORY_DEF } from '../fields';
import { stringifyForError } from '../util/misc_utils';
import { angularCoreEnv } from './environment';
import { flushModuleScopingQueueAsMuchAsPossible, patchComponentDefWithScope, transitiveScopesFor } from './module';
/**
 * Compile an Angular component according to its decorator metadata, and patch the resulting
 * component def (ɵcmp) onto the component type.
 *
 * Compilation may be asynchronous (due to the need to resolve URLs for the component template or
 * other resources, for example). In the event that compilation is not immediate, `compileComponent`
 * will enqueue resource resolution into a global queue and will fail to return the `ɵcmp`
 * until the global queue has been resolved with a call to `resolveComponentResources`.
 */
export function compileComponent(type, metadata) {
    // Initialize ngDevMode. This must be the first statement in compileComponent.
    // See the `initNgDevMode` docstring for more information.
    (typeof ngDevMode === 'undefined' || ngDevMode) && initNgDevMode();
    var ngComponentDef = null;
    // Metadata may have resources which need to be resolved.
    maybeQueueResolutionOfComponentResources(type, metadata);
    // Note that we're using the same function as `Directive`, because that's only subset of metadata
    // that we need to create the ngFactoryDef. We're avoiding using the component metadata
    // because we'd have to resolve the asynchronous templates.
    addDirectiveFactoryDef(type, metadata);
    Object.defineProperty(type, NG_COMP_DEF, {
        get: function () {
            if (ngComponentDef === null) {
                var compiler = getCompilerFacade();
                if (componentNeedsResolution(metadata)) {
                    var error = ["Component '" + type.name + "' is not resolved:"];
                    if (metadata.templateUrl) {
                        error.push(" - templateUrl: " + metadata.templateUrl);
                    }
                    if (metadata.styleUrls && metadata.styleUrls.length) {
                        error.push(" - styleUrls: " + JSON.stringify(metadata.styleUrls));
                    }
                    error.push("Did you run and wait for 'resolveComponentResources()'?");
                    throw new Error(error.join('\n'));
                }
                var templateUrl = metadata.templateUrl || "ng:///" + type.name + "/template.html";
                var meta = __assign(__assign({}, directiveMetadata(type, metadata)), { typeSourceSpan: compiler.createParseSourceSpan('Component', type.name, templateUrl), template: metadata.template || '', preserveWhitespaces: metadata.preserveWhitespaces || false, styles: metadata.styles || EMPTY_ARRAY, animations: metadata.animations, directives: [], changeDetection: metadata.changeDetection, pipes: new Map(), encapsulation: metadata.encapsulation || ViewEncapsulation.Emulated, interpolation: metadata.interpolation, viewProviders: metadata.viewProviders || null });
                if (meta.usesInheritance) {
                    addDirectiveDefToUndecoratedParents(type);
                }
                ngComponentDef = compiler.compileComponent(angularCoreEnv, templateUrl, meta);
                // When NgModule decorator executed, we enqueued the module definition such that
                // it would only dequeue and add itself as module scope to all of its declarations,
                // but only if  if all of its declarations had resolved. This call runs the check
                // to see if any modules that are in the queue can be dequeued and add scope to
                // their declarations.
                flushModuleScopingQueueAsMuchAsPossible();
                // If component compilation is async, then the @NgModule annotation which declares the
                // component may execute and set an ngSelectorScope property on the component type. This
                // allows the component to patch itself with directiveDefs from the module after it
                // finishes compiling.
                if (hasSelectorScope(type)) {
                    var scopes = transitiveScopesFor(type.ngSelectorScope);
                    patchComponentDefWithScope(ngComponentDef, scopes);
                }
            }
            return ngComponentDef;
        },
        // Make the property configurable in dev mode to allow overriding in tests
        configurable: !!ngDevMode,
    });
}
function hasSelectorScope(component) {
    return component.ngSelectorScope !== undefined;
}
/**
 * Compile an Angular directive according to its decorator metadata, and patch the resulting
 * directive def onto the component type.
 *
 * In the event that compilation is not immediate, `compileDirective` will return a `Promise` which
 * will resolve when compilation completes and the directive becomes usable.
 */
export function compileDirective(type, directive) {
    var ngDirectiveDef = null;
    addDirectiveFactoryDef(type, directive || {});
    Object.defineProperty(type, NG_DIR_DEF, {
        get: function () {
            if (ngDirectiveDef === null) {
                // `directive` can be null in the case of abstract directives as a base class
                // that use `@Directive()` with no selector. In that case, pass empty object to the
                // `directiveMetadata` function instead of null.
                var meta = getDirectiveMetadata(type, directive || {});
                ngDirectiveDef =
                    getCompilerFacade().compileDirective(angularCoreEnv, meta.sourceMapUrl, meta.metadata);
            }
            return ngDirectiveDef;
        },
        // Make the property configurable in dev mode to allow overriding in tests
        configurable: !!ngDevMode,
    });
}
function getDirectiveMetadata(type, metadata) {
    var name = type && type.name;
    var sourceMapUrl = "ng:///" + name + "/\u0275dir.js";
    var compiler = getCompilerFacade();
    var facade = directiveMetadata(type, metadata);
    facade.typeSourceSpan = compiler.createParseSourceSpan('Directive', name, sourceMapUrl);
    if (facade.usesInheritance) {
        addDirectiveDefToUndecoratedParents(type);
    }
    return { metadata: facade, sourceMapUrl: sourceMapUrl };
}
function addDirectiveFactoryDef(type, metadata) {
    var ngFactoryDef = null;
    Object.defineProperty(type, NG_FACTORY_DEF, {
        get: function () {
            if (ngFactoryDef === null) {
                var meta = getDirectiveMetadata(type, metadata);
                var compiler = getCompilerFacade();
                ngFactoryDef = compiler.compileFactory(angularCoreEnv, "ng:///" + type.name + "/\u0275fac.js", __assign(__assign({}, meta.metadata), { injectFn: 'directiveInject', target: compiler.R3FactoryTarget.Directive }));
            }
            return ngFactoryDef;
        },
        // Make the property configurable in dev mode to allow overriding in tests
        configurable: !!ngDevMode,
    });
}
export function extendsDirectlyFromObject(type) {
    return Object.getPrototypeOf(type.prototype) === Object.prototype;
}
/**
 * Extract the `R3DirectiveMetadata` for a particular directive (either a `Directive` or a
 * `Component`).
 */
export function directiveMetadata(type, metadata) {
    // Reflect inputs and outputs.
    var reflect = getReflect();
    var propMetadata = reflect.ownPropMetadata(type);
    return {
        name: type.name,
        type: type,
        typeArgumentCount: 0,
        selector: metadata.selector !== undefined ? metadata.selector : null,
        deps: reflectDependencies(type),
        host: metadata.host || EMPTY_OBJ,
        propMetadata: propMetadata,
        inputs: metadata.inputs || EMPTY_ARRAY,
        outputs: metadata.outputs || EMPTY_ARRAY,
        queries: extractQueriesMetadata(type, propMetadata, isContentQuery),
        lifecycle: { usesOnChanges: reflect.hasLifecycleHook(type, 'ngOnChanges') },
        typeSourceSpan: null,
        usesInheritance: !extendsDirectlyFromObject(type),
        exportAs: extractExportAs(metadata.exportAs),
        providers: metadata.providers || null,
        viewQueries: extractQueriesMetadata(type, propMetadata, isViewQuery)
    };
}
/**
 * Adds a directive definition to all parent classes of a type that don't have an Angular decorator.
 */
function addDirectiveDefToUndecoratedParents(type) {
    var objPrototype = Object.prototype;
    var parent = Object.getPrototypeOf(type.prototype).constructor;
    // Go up the prototype until we hit `Object`.
    while (parent && parent !== objPrototype) {
        // Since inheritance works if the class was annotated already, we only need to add
        // the def if there are no annotations and the def hasn't been created already.
        if (!getDirectiveDef(parent) && !getComponentDef(parent) &&
            shouldAddAbstractDirective(parent)) {
            compileDirective(parent, null);
        }
        parent = Object.getPrototypeOf(parent);
    }
}
function convertToR3QueryPredicate(selector) {
    return typeof selector === 'string' ? splitByComma(selector) : resolveForwardRef(selector);
}
export function convertToR3QueryMetadata(propertyName, ann) {
    return {
        propertyName: propertyName,
        predicate: convertToR3QueryPredicate(ann.selector),
        descendants: ann.descendants,
        first: ann.first,
        read: ann.read ? ann.read : null,
        static: !!ann.static
    };
}
function extractQueriesMetadata(type, propMetadata, isQueryAnn) {
    var queriesMeta = [];
    var _loop_1 = function (field) {
        if (propMetadata.hasOwnProperty(field)) {
            var annotations_1 = propMetadata[field];
            annotations_1.forEach(function (ann) {
                if (isQueryAnn(ann)) {
                    if (!ann.selector) {
                        throw new Error("Can't construct a query for the property \"" + field + "\" of " +
                            ("\"" + stringifyForError(type) + "\" since the query selector wasn't defined."));
                    }
                    if (annotations_1.some(isInputAnnotation)) {
                        throw new Error("Cannot combine @Input decorators with query decorators");
                    }
                    queriesMeta.push(convertToR3QueryMetadata(field, ann));
                }
            });
        }
    };
    for (var field in propMetadata) {
        _loop_1(field);
    }
    return queriesMeta;
}
function extractExportAs(exportAs) {
    return exportAs === undefined ? null : splitByComma(exportAs);
}
function isContentQuery(value) {
    var name = value.ngMetadataName;
    return name === 'ContentChild' || name === 'ContentChildren';
}
function isViewQuery(value) {
    var name = value.ngMetadataName;
    return name === 'ViewChild' || name === 'ViewChildren';
}
function isInputAnnotation(value) {
    return value.ngMetadataName === 'Input';
}
function splitByComma(value) {
    return value.split(',').map(function (piece) { return piece.trim(); });
}
var LIFECYCLE_HOOKS = [
    'ngOnChanges', 'ngOnInit', 'ngOnDestroy', 'ngDoCheck', 'ngAfterViewInit', 'ngAfterViewChecked',
    'ngAfterContentInit', 'ngAfterContentChecked'
];
function shouldAddAbstractDirective(type) {
    var reflect = getReflect();
    if (LIFECYCLE_HOOKS.some(function (hookName) { return reflect.hasLifecycleHook(type, hookName); })) {
        return true;
    }
    var propMetadata = reflect.propMetadata(type);
    for (var field in propMetadata) {
        var annotations = propMetadata[field];
        for (var i = 0; i < annotations.length; i++) {
            var current = annotations[i];
            var metadataName = current.ngMetadataName;
            if (isInputAnnotation(current) || isContentQuery(current) || isViewQuery(current) ||
                metadataName === 'Output' || metadataName === 'HostBinding' ||
                metadataName === 'HostListener') {
                return true;
            }
        }
    }
    return false;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlyZWN0aXZlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGFja2FnZXMvY29yZS9zcmMvcmVuZGVyMy9qaXQvZGlyZWN0aXZlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7R0FNRzs7QUFFSCxPQUFPLEVBQTRCLGlCQUFpQixFQUFDLE1BQU0sZ0NBQWdDLENBQUM7QUFFNUYsT0FBTyxFQUFDLGlCQUFpQixFQUFDLE1BQU0sc0JBQXNCLENBQUM7QUFDdkQsT0FBTyxFQUFDLFVBQVUsRUFBRSxtQkFBbUIsRUFBQyxNQUFNLG1CQUFtQixDQUFDO0FBSWxFLE9BQU8sRUFBQyx3QkFBd0IsRUFBRSx3Q0FBd0MsRUFBQyxNQUFNLGlDQUFpQyxDQUFDO0FBQ25ILE9BQU8sRUFBQyxpQkFBaUIsRUFBQyxNQUFNLHFCQUFxQixDQUFDO0FBQ3RELE9BQU8sRUFBQyxhQUFhLEVBQUMsTUFBTSx3QkFBd0IsQ0FBQztBQUNyRCxPQUFPLEVBQUMsZUFBZSxFQUFFLGVBQWUsRUFBQyxNQUFNLGVBQWUsQ0FBQztBQUMvRCxPQUFPLEVBQUMsV0FBVyxFQUFFLFNBQVMsRUFBQyxNQUFNLFVBQVUsQ0FBQztBQUNoRCxPQUFPLEVBQUMsV0FBVyxFQUFFLFVBQVUsRUFBRSxjQUFjLEVBQUMsTUFBTSxXQUFXLENBQUM7QUFFbEUsT0FBTyxFQUFDLGlCQUFpQixFQUFDLE1BQU0sb0JBQW9CLENBQUM7QUFFckQsT0FBTyxFQUFDLGNBQWMsRUFBQyxNQUFNLGVBQWUsQ0FBQztBQUM3QyxPQUFPLEVBQUMsdUNBQXVDLEVBQUUsMEJBQTBCLEVBQUUsbUJBQW1CLEVBQUMsTUFBTSxVQUFVLENBQUM7QUFJbEg7Ozs7Ozs7O0dBUUc7QUFDSCxNQUFNLFVBQVUsZ0JBQWdCLENBQUMsSUFBZSxFQUFFLFFBQW1CO0lBQ25FLDhFQUE4RTtJQUM5RSwwREFBMEQ7SUFDMUQsQ0FBQyxPQUFPLFNBQVMsS0FBSyxX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LFdBQVcsR0FBRyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFeEMsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7WUFDM0MsSUFBTSxPQUFPLEdBQUcsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQy9CLElBQU0sWUFBWSxHQUFHLE9BQU8sQ0FBQyxjQUFjLENBQUM7WUFFNUMsSUFBSSxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsSUFBSSxjQUFjLENBQUMsT0FBTyxDQUFDLElBQUksV0FBVyxDQUFDLE9BQU8sQ0FBQztnQkFDN0UsWUFBWSxLQUFLLFFBQVEsSUFBSSxZQUFZLEtBQUssYUFBYTtnQkFDM0QsWUFBWSxLQUFLLGNBQWMsRUFBRTtnQkFDbkMsT0FBTyxJQUFJLENBQUM7YUFDYjtTQUNGO0tBQ0Y7SUFFRCxPQUFPLEtBQUssQ0FBQztBQUNmLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIEluYy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5cbmltcG9ydCB7UjNEaXJlY3RpdmVNZXRhZGF0YUZhY2FkZSwgZ2V0Q29tcGlsZXJGYWNhZGV9IGZyb20gJy4uLy4uL2NvbXBpbGVyL2NvbXBpbGVyX2ZhY2FkZSc7XG5pbXBvcnQge1IzQ29tcG9uZW50TWV0YWRhdGFGYWNhZGUsIFIzUXVlcnlNZXRhZGF0YUZhY2FkZX0gZnJvbSAnLi4vLi4vY29tcGlsZXIvY29tcGlsZXJfZmFjYWRlX2ludGVyZmFjZSc7XG5pbXBvcnQge3Jlc29sdmVGb3J3YXJkUmVmfSBmcm9tICcuLi8uLi9kaS9mb3J3YXJkX3JlZic7XG5pbXBvcnQge2dldFJlZmxlY3QsIHJlZmxlY3REZXBlbmRlbmNpZXN9IGZyb20gJy4uLy4uL2RpL2ppdC91dGlsJztcbmltcG9ydCB7VHlwZX0gZnJvbSAnLi4vLi4vaW50ZXJmYWNlL3R5cGUnO1xuaW1wb3J0IHtRdWVyeX0gZnJvbSAnLi4vLi4vbWV0YWRhdGEvZGknO1xuaW1wb3J0IHtDb21wb25lbnQsIERpcmVjdGl2ZSwgSW5wdXR9IGZyb20gJy4uLy4uL21ldGFkYXRhL2RpcmVjdGl2ZXMnO1xuaW1wb3J0IHtjb21wb25lbnROZWVkc1Jlc29sdXRpb24sIG1heWJlUXVldWVSZXNvbHV0aW9uT2ZDb21wb25lbnRSZXNvdXJjZXN9IGZyb20gJy4uLy4uL21ldGFkYXRhL3Jlc291cmNlX2xvYWRpbmcnO1xuaW1wb3J0IHtWaWV3RW5jYXBzdWxhdGlvbn0gZnJvbSAnLi4vLi4vbWV0YWRhdGEvdmlldyc7XG5pbXBvcnQge2luaXROZ0Rldk1vZGV9IGZyb20gJy4uLy4uL3V0aWwvbmdfZGV2X21vZGUnO1xuaW1wb3J0IHtnZXRDb21wb25lbnREZWYsIGdldERpcmVjdGl2ZURlZn0gZnJvbSAnLi4vZGVmaW5pdGlvbic7XG5pbXBvcnQge0VNUFRZX0FSUkFZLCBFTVBUWV9PQkp9IGZyb20gJy4uL2VtcHR5JztcbmltcG9ydCB7TkdfQ09NUF9ERUYsIE5HX0RJUl9ERUYsIE5HX0ZBQ1RPUllfREVGfSBmcm9tICcuLi9maWVsZHMnO1xuaW1wb3J0IHtDb21wb25lbnRUeXBlfSBmcm9tICcuLi9pbnRlcmZhY2VzL2RlZmluaXRpb24nO1xuaW1wb3J0IHtzdHJpbmdpZnlGb3JFcnJvcn0gZnJvbSAnLi4vdXRpbC9taXNjX3V0aWxzJztcblxuaW1wb3J0IHthbmd1bGFyQ29yZUVudn0gZnJvbSAnLi9lbnZpcm9ubWVudCc7XG5pbXBvcnQge2ZsdXNoTW9kdWxlU2NvcGluZ1F1ZXVlQXNNdWNoQXNQb3NzaWJsZSwgcGF0Y2hDb21wb25lbnREZWZXaXRoU2NvcGUsIHRyYW5zaXRpdmVTY29wZXNGb3J9IGZyb20gJy4vbW9kdWxlJztcblxuXG5cbi8qKlxuICogQ29tcGlsZSBhbiBBbmd1bGFyIGNvbXBvbmVudCBhY2NvcmRpbmcgdG8gaXRzIGRlY29yYXRvciBtZXRhZGF0YSwgYW5kIHBhdGNoIHRoZSByZXN1bHRpbmdcbiAqIGNvbXBvbmVudCBkZWYgKMm1Y21wKSBvbnRvIHRoZSBjb21wb25lbnQgdHlwZS5cbiAqXG4gKiBDb21waWxhdGlvbiBtYXkgYmUgYXN5bmNocm9ub3VzIChkdWUgdG8gdGhlIG5lZWQgdG8gcmVzb2x2ZSBVUkxzIGZvciB0aGUgY29tcG9uZW50IHRlbXBsYXRlIG9yXG4gKiBvdGhlciByZXNvdXJjZXMsIGZvciBleGFtcGxlKS4gSW4gdGhlIGV2ZW50IHRoYXQgY29tcGlsYXRpb24gaXMgbm90IGltbWVkaWF0ZSwgYGNvbXBpbGVDb21wb25lbnRgXG4gKiB3aWxsIGVucXVldWUgcmVzb3VyY2UgcmVzb2x1dGlvbiBpbnRvIGEgZ2xvYmFsIHF1ZXVlIGFuZCB3aWxsIGZhaWwgdG8gcmV0dXJuIHRoZSBgybVjbXBgXG4gKiB1bnRpbCB0aGUgZ2xvYmFsIHF1ZXVlIGhhcyBiZWVuIHJlc29sdmVkIHdpdGggYSBjYWxsIHRvIGByZXNvbHZlQ29tcG9uZW50UmVzb3VyY2VzYC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbXBpbGVDb21wb25lbnQodHlwZTogVHlwZTxhbnk+LCBtZXRhZGF0YTogQ29tcG9uZW50KTogdm9pZCB7XG4gIC8vIEluaXRpYWxpemUgbmdEZXZNb2RlLiBUaGlzIG11c3QgYmUgdGhlIGZpcnN0IHN0YXRlbWVudCBpbiBjb21waWxlQ29tcG9uZW50LlxuICAvLyBTZWUgdGhlIGBpbml0TmdEZXZNb2RlYCBkb2NzdHJpbmcgZm9yIG1vcmUgaW5mb3JtYXRpb24uXG4gICh0eXBlb2YgbmdEZXZNb2RlID09PSAndW5kZWZpbmVkJyB8fCBuZ0Rldk1vZGUpICYmIGluaXROZ0Rldk1vZGUoKTtcblxuICBsZXQgbmdDb21wb25lbnREZWY6IGFueSA9IG51bGw7XG5cbiAgLy8gTWV0YWRhdGEgbWF5IGhhdmUgcmVzb3VyY2VzIHdoaWNoIG5lZWQgdG8gYmUgcmVzb2x2ZWQuXG4gIG1heWJlUXVldWVSZXNvbHV0aW9uT2ZDb21wb25lbnRSZXNvdXJjZXModHlwZSwgbWV0YWRhdGEpO1xuXG4gIC8vIE5vdGUgdGhhdCB3ZSdyZSB1c2luZyB0aGUgc2FtZSBmdW5jdGlvbiBhcyBgRGlyZWN0aXZlYCwgYmVjYXVzZSB0aGF0J3Mgb25seSBzdWJzZXQgb2YgbWV0YWRhdGFcbiAgLy8gdGhhdCB3ZSBuZWVkIHRvIGNyZWF0ZSB0aGUgbmdGYWN0b3J5RGVmLiBXZSdyZSBhdm9pZGluZyB1c2luZyB0aGUgY29tcG9uZW50IG1ldGFkYXRhXG4gIC8vIGJlY2F1c2Ugd2UnZCBoYXZlIHRvIHJlc29sdmUgdGhlIGFzeW5jaHJvbm91cyB0ZW1wbGF0ZXMuXG4gIGFkZERpcmVjdGl2ZUZhY3RvcnlEZWYodHlwZSwgbWV0YWRhdGEpO1xuXG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0eXBlLCBOR19DT01QX0RFRiwge1xuICAgIGdldDogKCkgPT4ge1xuICAgICAgaWYgKG5nQ29tcG9uZW50RGVmID09PSBudWxsKSB7XG4gICAgICAgIGNvbnN0IGNvbXBpbGVyID0gZ2V0Q29tcGlsZXJGYWNhZGUoKTtcblxuICAgICAgICBpZiAoY29tcG9uZW50TmVlZHNSZXNvbHV0aW9uKG1ldGFkYXRhKSkge1xuICAgICAgICAgIGNvbnN0IGVycm9yID0gW2BDb21wb25lbnQgJyR7dHlwZS5uYW1lfScgaXMgbm90IHJlc29sdmVkOmBdO1xuICAgICAgICAgIGlmIChtZXRhZGF0YS50ZW1wbGF0ZVVybCkge1xuICAgICAgICAgICAgZXJyb3IucHVzaChgIC0gdGVtcGxhdGVVcmw6ICR7bWV0YWRhdGEudGVtcGxhdGVVcmx9YCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChtZXRhZGF0YS5zdHlsZVVybHMgJiYgbWV0YWRhdGEuc3R5bGVVcmxzLmxlbmd0aCkge1xuICAgICAgICAgICAgZXJyb3IucHVzaChgIC0gc3R5bGVVcmxzOiAke0pTT04uc3RyaW5naWZ5KG1ldGFkYXRhLnN0eWxlVXJscyl9YCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGVycm9yLnB1c2goYERpZCB5b3UgcnVuIGFuZCB3YWl0IGZvciAncmVzb2x2ZUNvbXBvbmVudFJlc291cmNlcygpJz9gKTtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoZXJyb3Iuam9pbignXFxuJykpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdGVtcGxhdGVVcmwgPSBtZXRhZGF0YS50ZW1wbGF0ZVVybCB8fCBgbmc6Ly8vJHt0eXBlLm5hbWV9L3RlbXBsYXRlLmh0bWxgO1xuICAgICAgICBjb25zdCBtZXRhOiBSM0NvbXBvbmVudE1ldGFkYXRhRmFjYWRlID0ge1xuICAgICAgICAgIC4uLmRpcmVjdGl2ZU1ldGFkYXRhKHR5cGUsIG1ldGFkYXRhKSxcbiAgICAgICAgICB0eXBlU291cmNlU3BhbjogY29tcGlsZXIuY3JlYXRlUGFyc2VTb3VyY2VTcGFuKCdDb21wb25lbnQnLCB0eXBlLm5hbWUsIHRlbXBsYXRlVXJsKSxcbiAgICAgICAgICB0ZW1wbGF0ZTogbWV0YWRhdGEudGVtcGxhdGUgfHwgJycsXG4gICAgICAgICAgcHJlc2VydmVXaGl0ZXNwYWNlczogbWV0YWRhdGEucHJlc2VydmVXaGl0ZXNwYWNlcyB8fCBmYWxzZSxcbiAgICAgICAgICBzdHlsZXM6IG1ldGFkYXRhLnN0eWxlcyB8fCBFTVBUWV9BUlJBWSxcbiAgICAgICAgICBhbmltYXRpb25zOiBtZXRhZGF0YS5hbmltYXRpb25zLFxuICAgICAgICAgIGRpcmVjdGl2ZXM6IFtdLFxuICAgICAgICAgIGNoYW5nZURldGVjdGlvbjogbWV0YWRhdGEuY2hhbmdlRGV0ZWN0aW9uLFxuICAgICAgICAgIHBpcGVzOiBuZXcgTWFwKCksXG4gICAgICAgICAgZW5jYXBzdWxhdGlvbjogbWV0YWRhdGEuZW5jYXBzdWxhdGlvbiB8fCBWaWV3RW5jYXBzdWxhdGlvbi5FbXVsYXRlZCxcbiAgICAgICAgICBpbnRlcnBvbGF0aW9uOiBtZXRhZGF0YS5pbnRlcnBvbGF0aW9uLFxuICAgICAgICAgIHZpZXdQcm92aWRlcnM6IG1ldGFkYXRhLnZpZXdQcm92aWRlcnMgfHwgbnVsbCxcbiAgICAgICAgfTtcbiAgICAgICAgaWYgKG1ldGEudXNlc0luaGVyaXRhbmNlKSB7XG4gICAgICAgICAgYWRkRGlyZWN0aXZlRGVmVG9VbmRlY29yYXRlZFBhcmVudHModHlwZSk7XG4gICAgICAgIH1cblxuICAgICAgICBuZ0NvbXBvbmVudERlZiA9IGNvbXBpbGVyLmNvbXBpbGVDb21wb25lbnQoYW5ndWxhckNvcmVFbnYsIHRlbXBsYXRlVXJsLCBtZXRhKTtcblxuICAgICAgICAvLyBXaGVuIE5nTW9kdWxlIGRlY29yYXRvciBleGVjdXRlZCwgd2UgZW5xdWV1ZWQgdGhlIG1vZHVsZSBkZWZpbml0aW9uIHN1Y2ggdGhhdFxuICAgICAgICAvLyBpdCB3b3VsZCBvbmx5IGRlcXVldWUgYW5kIGFkZCBpdHNlbGYgYXMgbW9kdWxlIHNjb3BlIHRvIGFsbCBvZiBpdHMgZGVjbGFyYXRpb25zLFxuICAgICAgICAvLyBidXQgb25seSBpZiAgaWYgYWxsIG9mIGl0cyBkZWNsYXJhdGlvbnMgaGFkIHJlc29sdmVkLiBUaGlzIGNhbGwgcnVucyB0aGUgY2hlY2tcbiAgICAgICAgLy8gdG8gc2VlIGlmIGFueSBtb2R1bGVzIHRoYXQgYXJlIGluIHRoZSBxdWV1ZSBjYW4gYmUgZGVxdWV1ZWQgYW5kIGFkZCBzY29wZSB0b1xuICAgICAgICAvLyB0aGVpciBkZWNsYXJhdGlvbnMuXG4gICAgICAgIGZsdXNoTW9kdWxlU2NvcGluZ1F1ZXVlQXNNdWNoQXNQb3NzaWJsZSgpO1xuXG4gICAgICAgIC8vIElmIGNvbXBvbmVudCBjb21waWxhdGlvbiBpcyBhc3luYywgdGhlbiB0aGUgQE5nTW9kdWxlIGFubm90YXRpb24gd2hpY2ggZGVjbGFyZXMgdGhlXG4gICAgICAgIC8vIGNvbXBvbmVudCBtYXkgZXhlY3V0ZSBhbmQgc2V0IGFuIG5nU2VsZWN0b3JTY29wZSBwcm9wZXJ0eSBvbiB0aGUgY29tcG9uZW50IHR5cGUuIFRoaXNcbiAgICAgICAgLy8gYWxsb3dzIHRoZSBjb21wb25lbnQgdG8gcGF0Y2ggaXRzZWxmIHdpdGggZGlyZWN0aXZlRGVmcyBmcm9tIHRoZSBtb2R1bGUgYWZ0ZXIgaXRcbiAgICAgICAgLy8gZmluaXNoZXMgY29tcGlsaW5nLlxuICAgICAgICBpZiAoaGFzU2VsZWN0b3JTY29wZSh0eXBlKSkge1xuICAgICAgICAgIGNvbnN0IHNjb3BlcyA9IHRyYW5zaXRpdmVTY29wZXNGb3IodHlwZS5uZ1NlbGVjdG9yU2NvcGUpO1xuICAgICAgICAgIHBhdGNoQ29tcG9uZW50RGVmV2l0aFNjb3BlKG5nQ29tcG9uZW50RGVmLCBzY29wZXMpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gbmdDb21wb25lbnREZWY7XG4gICAgfSxcbiAgICAvLyBNYWtlIHRoZSBwcm9wZXJ0eSBjb25maWd1cmFibGUgaW4gZGV2IG1vZGUgdG8gYWxsb3cgb3ZlcnJpZGluZyBpbiB0ZXN0c1xuICAgIGNvbmZpZ3VyYWJsZTogISFuZ0Rldk1vZGUsXG4gIH0pO1xufVxuXG5mdW5jdGlvbiBoYXNTZWxlY3RvclNjb3BlPFQ+KGNvbXBvbmVudDogVHlwZTxUPik6IGNvbXBvbmVudCBpcyBUeXBlPFQ+JlxuICAgIHtuZ1NlbGVjdG9yU2NvcGU6IFR5cGU8YW55Pn0ge1xuICByZXR1cm4gKGNvbXBvbmVudCBhc3tuZ1NlbGVjdG9yU2NvcGU/OiBhbnl9KS5uZ1NlbGVjdG9yU2NvcGUgIT09IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBDb21waWxlIGFuIEFuZ3VsYXIgZGlyZWN0aXZlIGFjY29yZGluZyB0byBpdHMgZGVjb3JhdG9yIG1ldGFkYXRhLCBhbmQgcGF0Y2ggdGhlIHJlc3VsdGluZ1xuICogZGlyZWN0aXZlIGRlZiBvbnRvIHRoZSBjb21wb25lbnQgdHlwZS5cbiAqXG4gKiBJbiB0aGUgZXZlbnQgdGhhdCBjb21waWxhdGlvbiBpcyBub3QgaW1tZWRpYXRlLCBgY29tcGlsZURpcmVjdGl2ZWAgd2lsbCByZXR1cm4gYSBgUHJvbWlzZWAgd2hpY2hcbiAqIHdpbGwgcmVzb2x2ZSB3aGVuIGNvbXBpbGF0aW9uIGNvbXBsZXRlcyBhbmQgdGhlIGRpcmVjdGl2ZSBiZWNvbWVzIHVzYWJsZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbXBpbGVEaXJlY3RpdmUodHlwZTogVHlwZTxhbnk+LCBkaXJlY3RpdmU6IERpcmVjdGl2ZSB8IG51bGwpOiB2b2lkIHtcbiAgbGV0IG5nRGlyZWN0aXZlRGVmOiBhbnkgPSBudWxsO1xuXG4gIGFkZERpcmVjdGl2ZUZhY3RvcnlEZWYodHlwZSwgZGlyZWN0aXZlIHx8IHt9KTtcblxuICBPYmplY3QuZGVmaW5lUHJvcGVydHkodHlwZSwgTkdfRElSX0RFRiwge1xuICAgIGdldDogKCkgPT4ge1xuICAgICAgaWYgKG5nRGlyZWN0aXZlRGVmID09PSBudWxsKSB7XG4gICAgICAgIC8vIGBkaXJlY3RpdmVgIGNhbiBiZSBudWxsIGluIHRoZSBjYXNlIG9mIGFic3RyYWN0IGRpcmVjdGl2ZXMgYXMgYSBiYXNlIGNsYXNzXG4gICAgICAgIC8vIHRoYXQgdXNlIGBARGlyZWN0aXZlKClgIHdpdGggbm8gc2VsZWN0b3IuIEluIHRoYXQgY2FzZSwgcGFzcyBlbXB0eSBvYmplY3QgdG8gdGhlXG4gICAgICAgIC8vIGBkaXJlY3RpdmVNZXRhZGF0YWAgZnVuY3Rpb24gaW5zdGVhZCBvZiBudWxsLlxuICAgICAgICBjb25zdCBtZXRhID0gZ2V0RGlyZWN0aXZlTWV0YWRhdGEodHlwZSwgZGlyZWN0aXZlIHx8IHt9KTtcbiAgICAgICAgbmdEaXJlY3RpdmVEZWYgPVxuICAgICAgICAgICAgZ2V0Q29tcGlsZXJGYWNhZGUoKS5jb21waWxlRGlyZWN0aXZlKGFuZ3VsYXJDb3JlRW52LCBtZXRhLnNvdXJjZU1hcFVybCwgbWV0YS5tZXRhZGF0YSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gbmdEaXJlY3RpdmVEZWY7XG4gICAgfSxcbiAgICAvLyBNYWtlIHRoZSBwcm9wZXJ0eSBjb25maWd1cmFibGUgaW4gZGV2IG1vZGUgdG8gYWxsb3cgb3ZlcnJpZGluZyBpbiB0ZXN0c1xuICAgIGNvbmZpZ3VyYWJsZTogISFuZ0Rldk1vZGUsXG4gIH0pO1xufVxuXG5mdW5jdGlvbiBnZXREaXJlY3RpdmVNZXRhZGF0YSh0eXBlOiBUeXBlPGFueT4sIG1ldGFkYXRhOiBEaXJlY3RpdmUpIHtcbiAgY29uc3QgbmFtZSA9IHR5cGUgJiYgdHlwZS5uYW1lO1xuICBjb25zdCBzb3VyY2VNYXBVcmwgPSBgbmc6Ly8vJHtuYW1lfS/JtWRpci5qc2A7XG4gIGNvbnN0IGNvbXBpbGVyID0gZ2V0Q29tcGlsZXJGYWNhZGUoKTtcbiAgY29uc3QgZmFjYWRlID0gZGlyZWN0aXZlTWV0YWRhdGEodHlwZSBhcyBDb21wb25lbnRUeXBlPGFueT4sIG1ldGFkYXRhKTtcbiAgZmFjYWRlLnR5cGVTb3VyY2VTcGFuID0gY29tcGlsZXIuY3JlYXRlUGFyc2VTb3VyY2VTcGFuKCdEaXJlY3RpdmUnLCBuYW1lLCBzb3VyY2VNYXBVcmwpO1xuICBpZiAoZmFjYWRlLnVzZXNJbmhlcml0YW5jZSkge1xuICAgIGFkZERpcmVjdGl2ZURlZlRvVW5kZWNvcmF0ZWRQYXJlbnRzKHR5cGUpO1xuICB9XG4gIHJldHVybiB7bWV0YWRhdGE6IGZhY2FkZSwgc291cmNlTWFwVXJsfTtcbn1cblxuZnVuY3Rpb24gYWRkRGlyZWN0aXZlRmFjdG9yeURlZih0eXBlOiBUeXBlPGFueT4sIG1ldGFkYXRhOiBEaXJlY3RpdmUgfCBDb21wb25lbnQpIHtcbiAgbGV0IG5nRmFjdG9yeURlZjogYW55ID0gbnVsbDtcblxuICBPYmplY3QuZGVmaW5lUHJvcGVydHkodHlwZSwgTkdfRkFDVE9SWV9ERUYsIHtcbiAgICBnZXQ6ICgpID0+IHtcbiAgICAgIGlmIChuZ0ZhY3RvcnlEZWYgPT09IG51bGwpIHtcbiAgICAgICAgY29uc3QgbWV0YSA9IGdldERpcmVjdGl2ZU1ldGFkYXRhKHR5cGUsIG1ldGFkYXRhKTtcbiAgICAgICAgY29uc3QgY29tcGlsZXIgPSBnZXRDb21waWxlckZhY2FkZSgpO1xuICAgICAgICBuZ0ZhY3RvcnlEZWYgPSBjb21waWxlci5jb21waWxlRmFjdG9yeShhbmd1bGFyQ29yZUVudiwgYG5nOi8vLyR7dHlwZS5uYW1lfS/JtWZhYy5qc2AsIHtcbiAgICAgICAgICAuLi5tZXRhLm1ldGFkYXRhLFxuICAgICAgICAgIGluamVjdEZuOiAnZGlyZWN0aXZlSW5qZWN0JyxcbiAgICAgICAgICB0YXJnZXQ6IGNvbXBpbGVyLlIzRmFjdG9yeVRhcmdldC5EaXJlY3RpdmVcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gbmdGYWN0b3J5RGVmO1xuICAgIH0sXG4gICAgLy8gTWFrZSB0aGUgcHJvcGVydHkgY29uZmlndXJhYmxlIGluIGRldiBtb2RlIHRvIGFsbG93IG92ZXJyaWRpbmcgaW4gdGVzdHNcbiAgICBjb25maWd1cmFibGU6ICEhbmdEZXZNb2RlLFxuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4dGVuZHNEaXJlY3RseUZyb21PYmplY3QodHlwZTogVHlwZTxhbnk+KTogYm9vbGVhbiB7XG4gIHJldHVybiBPYmplY3QuZ2V0UHJvdG90eXBlT2YodHlwZS5wcm90b3R5cGUpID09PSBPYmplY3QucHJvdG90eXBlO1xufVxuXG4vKipcbiAqIEV4dHJhY3QgdGhlIGBSM0RpcmVjdGl2ZU1ldGFkYXRhYCBmb3IgYSBwYXJ0aWN1bGFyIGRpcmVjdGl2ZSAoZWl0aGVyIGEgYERpcmVjdGl2ZWAgb3IgYVxuICogYENvbXBvbmVudGApLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZGlyZWN0aXZlTWV0YWRhdGEodHlwZTogVHlwZTxhbnk+LCBtZXRhZGF0YTogRGlyZWN0aXZlKTogUjNEaXJlY3RpdmVNZXRhZGF0YUZhY2FkZSB7XG4gIC8vIFJlZmxlY3QgaW5wdXRzIGFuZCBvdXRwdXRzLlxuICBjb25zdCByZWZsZWN0ID0gZ2V0UmVmbGVjdCgpO1xuICBjb25zdCBwcm9wTWV0YWRhdGEgPSByZWZsZWN0Lm93blByb3BNZXRhZGF0YSh0eXBlKTtcblxuICByZXR1cm4ge1xuICAgIG5hbWU6IHR5cGUubmFtZSxcbiAgICB0eXBlOiB0eXBlLFxuICAgIHR5cGVBcmd1bWVudENvdW50OiAwLFxuICAgIHNlbGVjdG9yOiBtZXRhZGF0YS5zZWxlY3RvciAhPT0gdW5kZWZpbmVkID8gbWV0YWRhdGEuc2VsZWN0b3IgOiBudWxsLFxuICAgIGRlcHM6IHJlZmxlY3REZXBlbmRlbmNpZXModHlwZSksXG4gICAgaG9zdDogbWV0YWRhdGEuaG9zdCB8fCBFTVBUWV9PQkosXG4gICAgcHJvcE1ldGFkYXRhOiBwcm9wTWV0YWRhdGEsXG4gICAgaW5wdXRzOiBtZXRhZGF0YS5pbnB1dHMgfHwgRU1QVFlfQVJSQVksXG4gICAgb3V0cHV0czogbWV0YWRhdGEub3V0cHV0cyB8fCBFTVBUWV9BUlJBWSxcbiAgICBxdWVyaWVzOiBleHRyYWN0UXVlcmllc01ldGFkYXRhKHR5cGUsIHByb3BNZXRhZGF0YSwgaXNDb250ZW50UXVlcnkpLFxuICAgIGxpZmVjeWNsZToge3VzZXNPbkNoYW5nZXM6IHJlZmxlY3QuaGFzTGlmZWN5Y2xlSG9vayh0eXBlLCAnbmdPbkNoYW5nZXMnKX0sXG4gICAgdHlwZVNvdXJjZVNwYW46IG51bGwgISxcbiAgICB1c2VzSW5oZXJpdGFuY2U6ICFleHRlbmRzRGlyZWN0bHlGcm9tT2JqZWN0KHR5cGUpLFxuICAgIGV4cG9ydEFzOiBleHRyYWN0RXhwb3J0QXMobWV0YWRhdGEuZXhwb3J0QXMpLFxuICAgIHByb3ZpZGVyczogbWV0YWRhdGEucHJvdmlkZXJzIHx8IG51bGwsXG4gICAgdmlld1F1ZXJpZXM6IGV4dHJhY3RRdWVyaWVzTWV0YWRhdGEodHlwZSwgcHJvcE1ldGFkYXRhLCBpc1ZpZXdRdWVyeSlcbiAgfTtcbn1cblxuLyoqXG4gKiBBZGRzIGEgZGlyZWN0aXZlIGRlZmluaXRpb24gdG8gYWxsIHBhcmVudCBjbGFzc2VzIG9mIGEgdHlwZSB0aGF0IGRvbid0IGhhdmUgYW4gQW5ndWxhciBkZWNvcmF0b3IuXG4gKi9cbmZ1bmN0aW9uIGFkZERpcmVjdGl2ZURlZlRvVW5kZWNvcmF0ZWRQYXJlbnRzKHR5cGU6IFR5cGU8YW55Pikge1xuICBjb25zdCBvYmpQcm90b3R5cGUgPSBPYmplY3QucHJvdG90eXBlO1xuICBsZXQgcGFyZW50ID0gT2JqZWN0LmdldFByb3RvdHlwZU9mKHR5cGUucHJvdG90eXBlKS5jb25zdHJ1Y3RvcjtcblxuICAvLyBHbyB1cCB0aGUgcHJvdG90eXBlIHVudGlsIHdlIGhpdCBgT2JqZWN0YC5cbiAgd2hpbGUgKHBhcmVudCAmJiBwYXJlbnQgIT09IG9ialByb3RvdHlwZSkge1xuICAgIC8vIFNpbmNlIGluaGVyaXRhbmNlIHdvcmtzIGlmIHRoZSBjbGFzcyB3YXMgYW5ub3RhdGVkIGFscmVhZHksIHdlIG9ubHkgbmVlZCB0byBhZGRcbiAgICAvLyB0aGUgZGVmIGlmIHRoZXJlIGFyZSBubyBhbm5vdGF0aW9ucyBhbmQgdGhlIGRlZiBoYXNuJ3QgYmVlbiBjcmVhdGVkIGFscmVhZHkuXG4gICAgaWYgKCFnZXREaXJlY3RpdmVEZWYocGFyZW50KSAmJiAhZ2V0Q29tcG9uZW50RGVmKHBhcmVudCkgJiZcbiAgICAgICAgc2hvdWxkQWRkQWJzdHJhY3REaXJlY3RpdmUocGFyZW50KSkge1xuICAgICAgY29tcGlsZURpcmVjdGl2ZShwYXJlbnQsIG51bGwpO1xuICAgIH1cbiAgICBwYXJlbnQgPSBPYmplY3QuZ2V0UHJvdG90eXBlT2YocGFyZW50KTtcbiAgfVxufVxuXG5mdW5jdGlvbiBjb252ZXJ0VG9SM1F1ZXJ5UHJlZGljYXRlKHNlbGVjdG9yOiBhbnkpOiBhbnl8c3RyaW5nW10ge1xuICByZXR1cm4gdHlwZW9mIHNlbGVjdG9yID09PSAnc3RyaW5nJyA/IHNwbGl0QnlDb21tYShzZWxlY3RvcikgOiByZXNvbHZlRm9yd2FyZFJlZihzZWxlY3Rvcik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb252ZXJ0VG9SM1F1ZXJ5TWV0YWRhdGEocHJvcGVydHlOYW1lOiBzdHJpbmcsIGFubjogUXVlcnkpOiBSM1F1ZXJ5TWV0YWRhdGFGYWNhZGUge1xuICByZXR1cm4ge1xuICAgIHByb3BlcnR5TmFtZTogcHJvcGVydHlOYW1lLFxuICAgIHByZWRpY2F0ZTogY29udmVydFRvUjNRdWVyeVByZWRpY2F0ZShhbm4uc2VsZWN0b3IpLFxuICAgIGRlc2NlbmRhbnRzOiBhbm4uZGVzY2VuZGFudHMsXG4gICAgZmlyc3Q6IGFubi5maXJzdCxcbiAgICByZWFkOiBhbm4ucmVhZCA/IGFubi5yZWFkIDogbnVsbCxcbiAgICBzdGF0aWM6ICEhYW5uLnN0YXRpY1xuICB9O1xufVxuZnVuY3Rpb24gZXh0cmFjdFF1ZXJpZXNNZXRhZGF0YShcbiAgICB0eXBlOiBUeXBlPGFueT4sIHByb3BNZXRhZGF0YToge1trZXk6IHN0cmluZ106IGFueVtdfSxcbiAgICBpc1F1ZXJ5QW5uOiAoYW5uOiBhbnkpID0+IGFubiBpcyBRdWVyeSk6IFIzUXVlcnlNZXRhZGF0YUZhY2FkZVtdIHtcbiAgY29uc3QgcXVlcmllc01ldGE6IFIzUXVlcnlNZXRhZGF0YUZhY2FkZVtdID0gW107XG4gIGZvciAoY29uc3QgZmllbGQgaW4gcHJvcE1ldGFkYXRhKSB7XG4gICAgaWYgKHByb3BNZXRhZGF0YS5oYXNPd25Qcm9wZXJ0eShmaWVsZCkpIHtcbiAgICAgIGNvbnN0IGFubm90YXRpb25zID0gcHJvcE1ldGFkYXRhW2ZpZWxkXTtcbiAgICAgIGFubm90YXRpb25zLmZvckVhY2goYW5uID0+IHtcbiAgICAgICAgaWYgKGlzUXVlcnlBbm4oYW5uKSkge1xuICAgICAgICAgIGlmICghYW5uLnNlbGVjdG9yKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgICAgYENhbid0IGNvbnN0cnVjdCBhIHF1ZXJ5IGZvciB0aGUgcHJvcGVydHkgXCIke2ZpZWxkfVwiIG9mIGAgK1xuICAgICAgICAgICAgICAgIGBcIiR7c3RyaW5naWZ5Rm9yRXJyb3IodHlwZSl9XCIgc2luY2UgdGhlIHF1ZXJ5IHNlbGVjdG9yIHdhc24ndCBkZWZpbmVkLmApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoYW5ub3RhdGlvbnMuc29tZShpc0lucHV0QW5ub3RhdGlvbikpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQ2Fubm90IGNvbWJpbmUgQElucHV0IGRlY29yYXRvcnMgd2l0aCBxdWVyeSBkZWNvcmF0b3JzYCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHF1ZXJpZXNNZXRhLnB1c2goY29udmVydFRvUjNRdWVyeU1ldGFkYXRhKGZpZWxkLCBhbm4pKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBxdWVyaWVzTWV0YTtcbn1cblxuZnVuY3Rpb24gZXh0cmFjdEV4cG9ydEFzKGV4cG9ydEFzOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmdbXXxudWxsIHtcbiAgcmV0dXJuIGV4cG9ydEFzID09PSB1bmRlZmluZWQgPyBudWxsIDogc3BsaXRCeUNvbW1hKGV4cG9ydEFzKTtcbn1cblxuZnVuY3Rpb24gaXNDb250ZW50UXVlcnkodmFsdWU6IGFueSk6IHZhbHVlIGlzIFF1ZXJ5IHtcbiAgY29uc3QgbmFtZSA9IHZhbHVlLm5nTWV0YWRhdGFOYW1lO1xuICByZXR1cm4gbmFtZSA9PT0gJ0NvbnRlbnRDaGlsZCcgfHwgbmFtZSA9PT0gJ0NvbnRlbnRDaGlsZHJlbic7XG59XG5cbmZ1bmN0aW9uIGlzVmlld1F1ZXJ5KHZhbHVlOiBhbnkpOiB2YWx1ZSBpcyBRdWVyeSB7XG4gIGNvbnN0IG5hbWUgPSB2YWx1ZS5uZ01ldGFkYXRhTmFtZTtcbiAgcmV0dXJuIG5hbWUgPT09ICdWaWV3Q2hpbGQnIHx8IG5hbWUgPT09ICdWaWV3Q2hpbGRyZW4nO1xufVxuXG5mdW5jdGlvbiBpc0lucHV0QW5ub3RhdGlvbih2YWx1ZTogYW55KTogdmFsdWUgaXMgSW5wdXQge1xuICByZXR1cm4gdmFsdWUubmdNZXRhZGF0YU5hbWUgPT09ICdJbnB1dCc7XG59XG5cbmZ1bmN0aW9uIHNwbGl0QnlDb21tYSh2YWx1ZTogc3RyaW5nKTogc3RyaW5nW10ge1xuICByZXR1cm4gdmFsdWUuc3BsaXQoJywnKS5tYXAocGllY2UgPT4gcGllY2UudHJpbSgpKTtcbn1cblxuY29uc3QgTElGRUNZQ0xFX0hPT0tTID0gW1xuICAnbmdPbkNoYW5nZXMnLCAnbmdPbkluaXQnLCAnbmdPbkRlc3Ryb3knLCAnbmdEb0NoZWNrJywgJ25nQWZ0ZXJWaWV3SW5pdCcsICduZ0FmdGVyVmlld0NoZWNrZWQnLFxuICAnbmdBZnRlckNvbnRlbnRJbml0JywgJ25nQWZ0ZXJDb250ZW50Q2hlY2tlZCdcbl07XG5cbmZ1bmN0aW9uIHNob3VsZEFkZEFic3RyYWN0RGlyZWN0aXZlKHR5cGU6IFR5cGU8YW55Pik6IGJvb2xlYW4ge1xuICBjb25zdCByZWZsZWN0ID0gZ2V0UmVmbGVjdCgpO1xuXG4gIGlmIChMSUZFQ1lDTEVfSE9PS1Muc29tZShob29rTmFtZSA9PiByZWZsZWN0Lmhhc0xpZmVjeWNsZUhvb2sodHlwZSwgaG9va05hbWUpKSkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgY29uc3QgcHJvcE1ldGFkYXRhID0gcmVmbGVjdC5wcm9wTWV0YWRhdGEodHlwZSk7XG5cbiAgZm9yIChjb25zdCBmaWVsZCBpbiBwcm9wTWV0YWRhdGEpIHtcbiAgICBjb25zdCBhbm5vdGF0aW9ucyA9IHByb3BNZXRhZGF0YVtmaWVsZF07XG5cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGFubm90YXRpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBjdXJyZW50ID0gYW5ub3RhdGlvbnNbaV07XG4gICAgICBjb25zdCBtZXRhZGF0YU5hbWUgPSBjdXJyZW50Lm5nTWV0YWRhdGFOYW1lO1xuXG4gICAgICBpZiAoaXNJbnB1dEFubm90YXRpb24oY3VycmVudCkgfHwgaXNDb250ZW50UXVlcnkoY3VycmVudCkgfHwgaXNWaWV3UXVlcnkoY3VycmVudCkgfHxcbiAgICAgICAgICBtZXRhZGF0YU5hbWUgPT09ICdPdXRwdXQnIHx8IG1ldGFkYXRhTmFtZSA9PT0gJ0hvc3RCaW5kaW5nJyB8fFxuICAgICAgICAgIG1ldGFkYXRhTmFtZSA9PT0gJ0hvc3RMaXN0ZW5lcicpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGZhbHNlO1xufVxuIl19