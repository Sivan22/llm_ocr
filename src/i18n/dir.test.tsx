import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';

describe('Radix Tabs dir cascade', () => {
  it('outputs dir="rtl" on the Tabs root div', () => {
    const html = renderToString(
      <Tabs defaultValue="a" dir="rtl">
        <TabsList>
          <TabsTrigger value="a">First</TabsTrigger>
          <TabsTrigger value="b">Second</TabsTrigger>
        </TabsList>
        <TabsContent value="a">c</TabsContent>
      </Tabs>,
    );
    console.log('Rendered HTML:', html);
    expect(html).toContain('dir="rtl"');
  });
});
