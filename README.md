# aws-service

AWS service utilities.

# API Documentation

## Constants

<dl>
<dt><a href="#resolveContexts">resolveContexts</a> ⇒ <code><a href="#TemplateContext">Array.&lt;TemplateContext&gt;</a></code> | <code>undefined</code></dt>
<dd><p>Resolves ContextMaps for a given data object.</p>
</dd>
</dl>

## Typedefs

<dl>
<dt><a href="#TemplateContextMap">TemplateContextMap</a> : <code>object</code></dt>
<dd><p>An object relating a TemplateContextToken to a path in a data object expressing the associated contextId.</p>
</dd>
<dt><a href="#TemplateContext">TemplateContext</a> : <code>object</code></dt>
<dd><p>An object relating a TemplateContextToken to a contextId.</p>
</dd>
</dl>

<a name="TemplateContextToken"></a>

## TemplateContextToken : <code>enum</code>
Enum for template context tokens.

**Kind**: global enum  
**Properties**

| Name | Type | Default |
| --- | --- | --- |
| APPLICATION | <code>string</code> | <code>&quot;application&quot;</code> | 
| GROUP | <code>string</code> | <code>&quot;group&quot;</code> | 
| MERCHANT | <code>string</code> | <code>&quot;merchant&quot;</code> | 
| OFFER | <code>string</code> | <code>&quot;offer&quot;</code> | 

<a name="resolveContexts"></a>

## resolveContexts ⇒ [<code>Array.&lt;TemplateContext&gt;</code>](#TemplateContext) \| <code>undefined</code>
Resolves ContextMaps for a given data object.

**Kind**: global constant  
**Returns**: [<code>Array.&lt;TemplateContext&gt;</code>](#TemplateContext) \| <code>undefined</code> - - An array of resolved contexts.  

| Param | Type | Description |
| --- | --- | --- |
| [contextMaps] | [<code>Array.&lt;TemplateContextMap&gt;</code>](#TemplateContextMap) \| [<code>TemplateContextMap</code>](#TemplateContextMap) \| <code>TemplateContextToken.APPLICATION</code> | An array of TemplateContextMaps, a single TemplateContextMap, or TemplateContextToken.APPLICATION. |
| data | <code>object</code> | The source data object. |

<a name="TemplateContextMap"></a>

## TemplateContextMap : <code>object</code>
An object relating a TemplateContextToken to a path in a data object expressing the associated contextId.

**Kind**: global typedef  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| contextToken | [<code>TemplateContextToken</code>](#TemplateContextToken) | The context to be resolved. |
| [path] | <code>string</code> | The path to the contextId in the data object. Ignored for context 'application'. |

<a name="TemplateContext"></a>

## TemplateContext : <code>object</code>
An object relating a TemplateContextToken to a contextId.

**Kind**: global typedef  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| contextToken | [<code>TemplateContextToken</code>](#TemplateContextToken) | The context to be resolved. |
| [contextId] | <code>number</code> \| <code>string</code> | The path to the contextId in the data object. Not valid for context 'application'. |


---

See more great templates and other tools on
[my GitHub Profile](https://github.com/karmaniverous)!
