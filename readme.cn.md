# node-red-contrib-tcp-request2

如果设置固定的超时时间，那么每次都要等待相同的时间（虽然影响不大）；如果设置固定的数据长度，那么如果对方没有返回内容，连接将会一只挂在那个地方；

因此，需要一个设置了 x 长度的等待上限，在y秒内，没有返回的话，报超时。而如果y秒内返回了 x长度，就结束等待，立即返回内容。

splitc 当在time和count方式的时候分别有两种含义，我认为应该把他们分开。

不同于官方的 tcp request 节点，tcp request2 有下述修改：

1. 保留原来的基于时间、字符、长度的逻辑方式。
2. socketTimeout 改为可以在设置界面设置。
3. server和port可以通过msg、global、flow、env设置。
4. buffer长度在非基于长度的tcp请求方式下，可以自行设置。


