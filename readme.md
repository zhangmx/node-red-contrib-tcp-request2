# node-red-contrib-tcp-request2

The official tcp request node of Node-RED has some problems:

If a fixed timeout is set, it will always wait for the same time (although the impact is not great); if a fixed data length is set, if the other party does not return the content, the connection will hang there.

Therefore, a maximum waiting length of x is needed. Within y seconds, if there is no return, a timeout will be reported. However, if x length is returned within y seconds, the waiting will end immediately and the content will be returned. 

In addition, the splitc variable has two different meanings in the time and count modes respectively. I think they should be separated.

Different from the official tcp request node, tcp request2 has the following modifications:

1. Splitc splits into two parameters with different meanings: waitingTime and waitingLength.
2. After setting the waiting length, the default waitingTime is 0, and it will always wait for the request to return a reply of sufficient length.
3. After setting the waiting length, set waitingTime, wait for waitingTime time, if there is no content or the content length is insufficient, return timeout; if the request returns a reply of sufficient length, end the wait and complete the request.
